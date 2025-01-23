import { LRUCache } from 'lru-cache'
import { workspace } from 'vscode'
import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    type CompletionParameters,
    Typewriter,
    currentAuthStatus,
    currentSiteVersion,
    isAbortError,
    isDotCom,
    isNetworkLikeError,
    modelsService,
    posixFilePaths,
    telemetryRecorder,
    tracer,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import type { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { logError } from '../output-channel-logger'

import {
    DEFAULT_EVENT_SOURCE,
    EventSourceTelemetryMetadataMapping,
} from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { doesFileExist } from '../commands/utils/workspace-files'
import { getEditor } from '../editor/active-editor'
import { CodyTaskState } from '../non-stop/state'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import { resolveRelativeOrAbsoluteUri } from '../services/utils/edit-create-file'
import type { EditManagerOptions } from './manager'
import { responseTransformer } from './output/response-transformer'
import { buildInteraction } from './prompt'
import { PROMPT_TOPICS } from './prompt/constants'
import { EditIntentTelemetryMetadataMapping, EditModeTelemetryMetadataMapping } from './types'
import { isStreamedIntent } from './utils/edit-intent'

interface EditProviderOptions extends EditManagerOptions {
    task: FixupTask
    controller: FixupController
}

/**
 * Data structure that captures an in-progress or completed streaming session
 * for a given task. This allows both “prefetch” and “startEdit” to share
 * partial text and avoid multiple LLM requests.
 */
interface StreamSession {
    // Accumulates partial text as it comes in
    partialText: string
    // Tracks whether streaming is fully done
    isComplete: boolean
    // For streaming abort
    abortController: AbortController
    // In-flight streaming promise (so we won't start two streams for the same task)
    streamingPromise: Promise<void> | null
    // Multiplexer to broadcast partial content
    multiplexer: BotResponseMultiplexer
    // TODO: hacky way to notify the streaming logic that we now want to update the UI
    // with the response. This field is `false` initially during prefetching and is
    // mutated to `true` when user clicks "start edit".
    isPrefetch: boolean
}

/**
 * We store the streaming session in a Map keyed by task ID so prefetchEdit
 * and startEdit share the same stream if it’s in progress.
 */
const streamingSessions = new LRUCache<string, StreamSession>({ max: 20 })

// Initiates a completion and responds to the result from the LLM. Implements
// "tools" like directing the response into a specific file. Code is forwarded
// to the FixupTask.
export class EditProvider {
    private insertionQueue: { response: string; isMessageInProgress: boolean }[] = []
    private insertionInProgress = false

    constructor(public config: EditProviderOptions) {}

    /**
     * Attempt to start streaming in “prefetch mode.” If a stream is already
     * in progress for this task, do nothing. The user has not clicked “apply”
     * yet, so we do NOT call controller.startTask here.
     */
    public async prefetchEdit(): Promise<void> {
        const { task } = this.config
        if (!streamingSessions.has(task.id)) {
            // Kick off streaming in the background (but do not mark the task as started)
            this.performStreamingEdit(task.id, false).catch(error => {
                // Remove the broken session so subsequent tries can retry
                streamingSessions.delete(task.id)
                // Rethrow so logs are visible
                throw error
            })
        }
    }

    /**
     * Called when the user actually clicks the button to “start edit.” If
     * streaming was prefetching in the background and is not completed, we
     * reuse the partial text. If no streaming session exists yet, we start it
     * normally. If streaming completed, we apply the final text instantly.
     */
    public async startEdit(): Promise<void> {
        const taskId = this.config.task.id
        // If no streaming session or there was an error, start from scratch
        if (!streamingSessions.has(taskId)) {
            await this.performStreamingEdit(taskId, true)
            return
        }
        const session = streamingSessions.get(taskId)!
        console.log(
            `await starEdit isCompletion: ${session.isComplete}; hasPartialText: ${Boolean(
                session.partialText
            )}`
        )
        // If streaming is already complete, just apply the final partial text
        if (session.isComplete) {
            // Mark the task started for UI
            this.config.controller.startTask(this.config.task)
            // The final text is in session.partialText
            return this.handleResponse(session.partialText, false)
        }
        // If streaming is still in progress, we “startTask” now for UI,
        // then replay what has arrived so far, and continue to stream new tokens.
        this.config.controller.startTask(this.config.task)
        session.isPrefetch = false
        // Immediately apply what has already been streamed
        if (session.partialText) {
            await this.handleResponse(session.partialText, true)
        }
        // We do NOT need to re-initiate streaming; it is already in flight.
        // We'll continue to get partial updates from the multiplexer.
        return
    }

    public abortEdit(): void {
        const taskId = this.config.task.id
        const session = streamingSessions.get(taskId)
        if (session) {
            session.abortController.abort()
        }
    }

    /**
     * Called by external code to directly apply the entire response (skipping any streaming).
     * We still call “startTask” first to ensure the UI updates accordingly.
     */
    public applyEdit(response: string): Promise<void> {
        this.config.controller.startTask(this.config.task)
        return this.handleResponse(response, false)
    }

    /**
     * The main streaming logic, extracted from the original startEdit. The only
     * difference is we have a parameter startTask that determines if we call
     * “controller.startTask” right away or wait until the user actually clicks.
     */
    private async performStreamingEdit(taskId: string, startTask: boolean): Promise<void> {
        console.log('performStreamingEdit: start')
        // Create a new session object and store it
        const abortController = new AbortController()
        const multiplexer = new BotResponseMultiplexer()
        const session: StreamSession = {
            isComplete: false,
            partialText: '',
            abortController,
            multiplexer,
            streamingPromise: null,
            isPrefetch: !startTask,
        }
        streamingSessions.set(taskId, session)

        session.streamingPromise = wrapInActiveSpan('command.edit.streaming', async span => {
            span.setAttribute('sampled', true)

            if (!session.isPrefetch) {
                this.config.controller.startTask(this.config.task)
            }

            const editTimeToFirstTokenSpan = tracer.startSpan('cody.edit.provider.timeToFirstToken')
            const model = this.config.task.model
            const contextWindow = modelsService.getContextWindowByID(model)
            const versions = await currentSiteVersion()
            if (!versions) {
                throw new Error('unable to determine site version')
            }
            const {
                messages,
                stopSequences,
                responseTopic,
                responsePrefix = '',
            } = await buildInteraction({
                model,
                codyApiVersion: versions.codyAPIVersion,
                contextWindow: contextWindow.input,
                task: this.config.task,
                editor: this.config.editor,
            }).catch(err => {
                this.handleError(err)
                throw err
            })

            // This handles the partial text streaming
            const typewriter = new Typewriter({
                update: content => {
                    session.partialText = content // store partial text in session
                    // If the user has called startEdit already, handle partial tokens
                    if (!session.isPrefetch) {
                        void this.handleResponse(content, true)
                    }
                },
                close: () => {},
            })

            let text = ''
            multiplexer.sub(responseTopic, {
                onResponse: async (content: string) => {
                    text += content
                    typewriter.update(text)
                    return Promise.resolve()
                },
                onTurnComplete: async () => {
                    typewriter.close()
                    typewriter.stop()
                    session.isComplete = true
                    session.partialText = text
                    // If user has started the task, pass final text to handleResponse(false)
                    // otherwise it’s “prefetched” and not yet shown or used
                    if (!session.isPrefetch) {
                        await this.handleResponse(text, false)
                    }
                    return Promise.resolve()
                },
            })

            // If “test” intent, handle test-file naming
            if (this.config.task.intent === 'test') {
                if (this.config.task.destinationFile) {
                    // We have already provided a destination file,
                    // Treat this as the test file to insert to
                    await this.config.controller.didReceiveNewFileRequest(
                        this.config.task.id,
                        this.config.task.destinationFile
                    )
                }

                // Listen to test file name suggestion from responses and create the file if we don't have one.
                // This allows Cody to let us know which test file we should add the new content to.
                // NOTE: Keep this multiplexer even if a destination file is set to catch the PROMPT_TOPICS.
                let filepath = ''
                multiplexer.sub(PROMPT_TOPICS.FILENAME.toString(), {
                    onResponse: async (content: string) => {
                        filepath += content
                        // handleFileCreationResponse will check if destinationFile is set
                        if (!session.isPrefetch) {
                            void this.handleFileCreationResponse(filepath, true)
                        }
                        return Promise.resolve()
                    },
                    onTurnComplete: async () => {
                        return Promise.resolve()
                    },
                })
            }

            const params = {
                model,
                stopSequences,
                maxTokensToSample: contextWindow.output,
            } as CompletionParameters

            if (model.includes('gpt-4o')) {
                // Use Predicted Output for gpt-4o models.
                // https://platform.openai.com/docs/guides/predicted-outputs
                params.prediction = {
                    type: 'content',
                    content: this.config.task.original,
                }
            }

            // Set stream param only when the model is disabled for streaming.
            if (modelsService.isStreamDisabled(model)) {
                params.stream = false
            }
            const stream = await this.config.chat.chat(messages, { ...params }, abortController.signal)

            let textConsumed = 0
            let firstTokenReceived = false

            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        if (textConsumed === 0 && responsePrefix) {
                            void multiplexer.publish(responsePrefix)
                        }
                        if (!firstTokenReceived && message.text.length > 1) {
                            editTimeToFirstTokenSpan.end()
                            firstTokenReceived = true
                        }
                        const chunk = message.text.slice(textConsumed)
                        textConsumed = message.text.length
                        void multiplexer.publish(chunk)
                        break
                    }
                    case 'complete': {
                        console.log('EDIT IS READY')
                        await multiplexer.notifyTurnComplete()
                        break
                    }
                    case 'error': {
                        let err = message.error
                        logError('EditProvider:onError', err.message)
                        if (isAbortError(err)) {
                            // Streams intentionally aborted; if user started the task,
                            // pass final partial text
                            if (!session.isPrefetch) {
                                void this.handleResponse(text, false)
                            }
                            return
                        }
                        if (isNetworkLikeError(err)) {
                            err = new Error('Cody could not respond due to network error.')
                        }

                        // Display error message as assistant response
                        this.handleError(err)
                        console.error(`Completion request failed: ${err.message}`)

                        break
                    }
                }
            }
        })

        // Let this method return after streaming initiates
        return session.streamingPromise
    }

    private async handleResponse(response: string, isMessageInProgress: boolean): Promise<void> {
        // Error state: The response finished but we didn't receive any text
        if (!response && !isMessageInProgress) {
            this.handleError(new Error('Cody did not respond with any text'))
            return
        }

        if (!response) {
            return
        }

        // If the response finished and we didn't receive a test file name suggestion,
        // we will create one manually before inserting the response to the new test file
        if (this.config.task.intent === 'test' && !this.config.task.destinationFile) {
            if (isMessageInProgress) {
                return
            }
            await this.handleFileCreationResponse('', isMessageInProgress)
        }

        if (!isMessageInProgress) {
            const { task } = this.config
            const legacyMetadata = {
                intent: EditIntentTelemetryMetadataMapping[task.intent] || task.intent,
                mode: EditModeTelemetryMetadataMapping[task.mode] || task.mode,
                source:
                    EventSourceTelemetryMetadataMapping[task.source || DEFAULT_EVENT_SOURCE] ||
                    task.source,
                ...countCode(response),
            }
            const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
            const endpoint = currentAuthStatus().endpoint
            telemetryRecorder.recordEvent('cody.fixup.response', 'hasCode', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                    // 🚨 SECURITY: edit responses are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an aditional safegaurd measure
                    responseText: endpoint && isDotCom(endpoint) ? response : undefined,
                },
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })
        }

        if (isStreamedIntent(this.config.task.intent)) {
            this.queueInsertion(response, isMessageInProgress)
        } else {
            this.handleFixupEdit(response, isMessageInProgress)
        }
    }

    private queueInsertion(response: string, isMessageInProgress: boolean): void {
        this.insertionQueue.push({ response, isMessageInProgress })
        if (!this.insertionInProgress) {
            void this.processQueue().catch(error => this.handleError(error))
        }
    }

    private async processQueue(): Promise<void> {
        this.insertionInProgress = true
        while (this.insertionQueue.length > 0) {
            const { response, isMessageInProgress } = this.insertionQueue.shift()!
            await this.handleFixupInsert(response, isMessageInProgress)
        }
        this.insertionInProgress = false
    }

    /**
     * Display an erred codelens to the user on failed fixup apply.
     * Will allow the user to view the error in more detail if needed.
     */
    protected handleError(error: Error): void {
        this.config.controller.error(this.config.task.id, error)
    }

    private async handleFixupEdit(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.controller.didReceiveFixupText(
            this.config.task.id,
            responseTransformer(response, this.config.task, isMessageInProgress),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFixupInsert(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.controller.didReceiveFixupInsertion(
            this.config.task.id,
            responseTransformer(response, this.config.task, isMessageInProgress),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFileCreationResponse(text: string, isMessageInProgress: boolean): Promise<void> {
        const task = this.config.task
        if (task.state !== CodyTaskState.Pending) {
            return
        }

        // Has already been created when set
        if (task.destinationFile) {
            return
        }

        // Manually create the file if no name was suggested
        if (!text.length && !isMessageInProgress) {
            // Create a new untitled file if the suggested file does not exist
            const currentFile = task.fixupFile.uri
            const currentDoc = await workspace.openTextDocument(currentFile)
            const newDoc = await workspace.openTextDocument({
                language: currentDoc?.languageId,
            })
            await this.config.controller.didReceiveNewFileRequest(this.config.task.id, newDoc.uri)
            return
        }

        const opentag = `<${PROMPT_TOPICS.FILENAME}>`
        const closetag = `</${PROMPT_TOPICS.FILENAME}>`

        const currentFileUri = task.fixupFile.uri
        // remove open and close tags from text
        const newFilePath = text.trim().replaceAll(new RegExp(`${opentag}(.*)${closetag}`, 'g'), '$1')

        // Get workspace uri using the current file uri
        const workspaceUri = workspace.getWorkspaceFolder(currentFileUri)?.uri
        const currentDirUri = Utils.joinPath(currentFileUri, '..')
        const activeEditor = getEditor()?.active?.document?.uri
        let newFileUri = await resolveRelativeOrAbsoluteUri(
            workspaceUri ?? currentDirUri,
            newFilePath,
            activeEditor
        )
        if (!newFileUri) {
            throw new Error('No editor found to insert text')
        }

        const haveSameExtensions =
            posixFilePaths.extname(uriBasename(currentFileUri)) === posixFilePaths.extname(newFilePath)
        if (haveSameExtensions && !task.destinationFile) {
            const fileIsFound = await doesFileExist(newFileUri)
            if (!fileIsFound) {
                newFileUri = newFileUri.with({ scheme: 'untitled' })
            }
            try {
                await this.config.controller.didReceiveNewFileRequest(task.id, newFileUri)
            } catch (error) {
                this.handleError(new Error('Cody failed to generate unit tests', { cause: error }))
            }
        }
    }
}

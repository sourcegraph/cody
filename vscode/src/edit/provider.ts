import { isError } from 'lodash'
import { LRUCache } from 'lru-cache'
import { workspace } from 'vscode'
import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    DEFAULT_EVENT_SOURCE,
    EventSourceTelemetryMetadataMapping,
    type SiteAndCodyAPIVersions,
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

import { doesFileExist } from '../commands/utils/workspace-files'
import { getEditor } from '../editor/active-editor'
import type { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { CodyTaskState } from '../non-stop/state'
import { logError } from '../output-channel-logger'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import { resolveRelativeOrAbsoluteUri } from '../services/utils/edit-create-file'
import type { ModelParameterProvider } from './adapters/base'
import { DefaultModelParameterProvider } from './adapters/default'
import { SmartApplyCustomModelParameterProvider } from './adapters/smart-apply-custom'
import type { EditManagerOptions } from './edit-manager'
import { responseTransformer } from './output/response-transformer'
import { DefaultEditPromptBuilder } from './prompt'
import { PROMPT_TOPICS, SMART_APPLY_MODEL_IDENTIFIERS } from './prompt/constants'
import { SmartApplyCustomEditPromptBuilder } from './prompt/smart-apply/apply/smart-apply-custom'
import type { EditPromptBuilder } from './prompt/type'
import { EditIntentTelemetryMetadataMapping, EditModeTelemetryMetadataMapping } from './types'

interface EditProviderOptions extends EditManagerOptions {
    task: FixupTask
    fixupController: FixupController
    siteVersion: SiteAndCodyAPIVersions | null
}

/**
 * Represents the possible states of a streaming edit session
 */
type StreamState = 'prefetching' | 'streaming' | 'completed'

/**
 * Data structure that captures an in-progress or completed streaming session
 * for a given task. This allows both "prefetch" and "startEdit" to share
 * partial text and avoid multiple LLM requests.
 */
export interface StreamSession {
    /** Accumulates partial text as it comes in */
    partialText: string
    /** For streaming abort */
    abortController: AbortController
    /** In-flight streaming promise (so we won't start two streams for the same task) */
    streamingPromise: Promise<void> | null
    /** Multiplexer to broadcast partial content */
    multiplexer: BotResponseMultiplexer
    /** Current state of the streaming session */
    state: StreamState
}

/**
 * We store the streaming session in a Map keyed by task ID so prefetchEdit
 * and startEdit share the same stream if it's in progress.
 */
export class EditProvider {
    private insertionQueue: { response: string; isMessageInProgress: boolean }[] = []
    private insertionInProgress = false
    private promptBuilder: EditPromptBuilder
    private modelParameterProvider: ModelParameterProvider
    private siteVersion: SiteAndCodyAPIVersions | null = null
    private cache = new LRUCache<string, StreamSession>({ max: 20 })

    constructor(public config: EditProviderOptions) {
        if (
            this.config.task.intent === 'smartApply' &&
            Object.values(SMART_APPLY_MODEL_IDENTIFIERS).includes(this.config.task.model)
        ) {
            this.modelParameterProvider = new SmartApplyCustomModelParameterProvider()
            this.promptBuilder = new SmartApplyCustomEditPromptBuilder()
        } else {
            this.modelParameterProvider = new DefaultModelParameterProvider()
            this.promptBuilder = new DefaultEditPromptBuilder()
        }
        this.siteVersion = this.config.siteVersion
    }

    /**
     * Attempt to start streaming in "prefetch mode." If a stream is already
     * in progress for this task, do nothing.
     */
    public prefetchStreamingEdit(): void {
        const { task } = this.config
        const session = this.cache.get(task.id)
        if (!session) {
            // Kick off streaming in the background (but do not mark the task as started)
            this.performStreamingEdit({ taskId: task.id, initialState: 'prefetching' }).catch(error => {
                // Remove the broken session so subsequent tries can retry
                this.cache.delete(task.id)
                // Rethrow so logs are visible
                throw error
            })
        }
    }

    /**
     * Called when the user actually clicks the button to "start edit." If
     * streaming was prefetching in the background and is not completed, we
     * reuse the partial text. If no streaming session exists yet, we start it
     * normally. If streaming completed, we apply the final text instantly.
     */
    public async startStreamingEdit(): Promise<void> {
        const taskId = this.config.task.id
        const session = this.cache.get(taskId)

        // Delete the cached session right after using the potentially cached value to avoid
        // reusing it more than once.
        this.cache.delete(taskId)

        // If no streaming session or there was an error, start from scratch
        if (!session) {
            await this.performStreamingEdit({ taskId, initialState: 'streaming' })
            return
        }

        // If streaming is already complete, just apply the final partial text
        if (session.state === 'completed') {
            // Mark the task started for UI
            this.config.fixupController.startTask(this.config.task)
            // The final text is in session.partialText
            return this.handleResponse(session.partialText, false)
        }

        // If streaming is still in progress, we "startTask" now for UI,
        // then replay what has arrived so far, and continue to stream new tokens.
        this.config.fixupController.startTask(this.config.task)
        session.state = 'streaming'
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
        const session = this.cache.get(taskId)
        if (session) {
            session.abortController.abort()
        }
    }

    /**
     * Called by external code to directly apply the entire response (skipping any streaming).
     * We still call "startTask" first to ensure the UI updates accordingly.
     */
    public applyEdit(response: string): Promise<void> {
        this.config.fixupController.startTask(this.config.task)
        return this.handleResponse(response, false)
    }

    private async performStreamingEdit({
        taskId,
        initialState,
    }: {
        taskId: string
        initialState: StreamState
    }): Promise<void> {
        const abortController = new AbortController()
        const multiplexer = new BotResponseMultiplexer()

        // Create a new session object and store it
        const session: StreamSession = {
            state: initialState,
            abortController,
            multiplexer,
            streamingPromise: null,
            partialText: '',
        }
        this.cache.set(taskId, session)

        session.streamingPromise = wrapInActiveSpan('command.edit.streaming', async span => {
            span.setAttribute('sampled', true)

            if (session.state === 'streaming') {
                this.config.fixupController.startTask(this.config.task)
            }

            const editTimeToFirstTokenSpan = tracer.startSpan('cody.edit.provider.timeToFirstToken')
            const model = this.config.task.model
            const contextWindow = modelsService.getContextWindowByID(model)
            const versions = this.siteVersion ?? (await currentSiteVersion())

            if (isError(versions)) {
                this.handleError(versions)
                return
            }
            const {
                messages,
                stopSequences,
                responseTopic,
                responsePrefix = '',
            } = await this.promptBuilder
                .buildInteraction({
                    model,
                    codyApiVersion: versions.codyAPIVersion,
                    contextWindow: contextWindow.input,
                    task: this.config.task,
                    editor: this.config.editor,
                })
                .catch(err => {
                    this.handleError(err)
                    throw err
                })

            // This handles the partial text streaming
            const typewriter = new Typewriter({
                update: content => {
                    session.partialText = content // store partial text in session
                    // If the session is in streaming state, handle partial tokens
                    if (session.state === 'streaming') {
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
                    const wasStreaming = session.state === 'streaming'
                    session.state = 'completed'
                    session.partialText = text
                    // If session is in streaming state, apply the final text in the UI.
                    if (wasStreaming) {
                        await this.handleResponse(text, false)
                    }
                    return Promise.resolve()
                },
            })

            // If "test" intent, handle test-file naming
            if (this.config.task.intent === 'test') {
                if (this.config.task.destinationFile) {
                    // We have already provided a destination file,
                    // Treat this as the test file to insert to
                    await this.config.fixupController.didReceiveNewFileRequest(
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
                        if (session.state === 'streaming') {
                            void this.handleFileCreationResponse(filepath, true)
                        }
                        return Promise.resolve()
                    },
                    onTurnComplete: async () => {
                        return Promise.resolve()
                    },
                })
            }

            const params = this.modelParameterProvider.getModelParameters({
                model,
                stopSequences,
                contextWindow,
                task: this.config.task,
            })

            const stream = await this.config.chatClient.chat(
                messages,
                { ...params },
                abortController.signal
            )

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
                        await multiplexer.notifyTurnComplete()
                        break
                    }
                    case 'error': {
                        let err = message.error
                        logError('EditProvider:onError', err.message)
                        if (isAbortError(err)) {
                            // Streams intentionally aborted; if in streaming state,
                            // pass final partial text
                            if (session.state === 'streaming') {
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

    // Applies a Guardrails check, if necessary, and resolves to `true` if
    // the edit should proceed. Handles cancelling the task if the attribution
    // check failed. Only call this once when a task is complete, because it
    // can initiate a snippet attribution request.
    private async checkGuardrails(task: FixupTask, response: string): Promise<boolean> {
        try {
            if (await this.config.guardrails.canPresentToUser(task.original, response ?? '')) {
                return true
            }
            this.config.fixupController.cancel(task)
            return false
        } catch (error) {
            this.config.fixupController.error(
                task.id,
                error instanceof Error ? error : new Error(`${error}`)
            )
            return false
        }
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

        if (this.config.task.intent === 'test' && !this.config.task.destinationFile) {
            // If the response finished and we didn't receive a test file name suggestion,
            // we will create one manually before inserting the response to the new test file
            if (isMessageInProgress) {
                return
            }
            await this.handleFileCreationResponse('', isMessageInProgress)
        }

        if (!isMessageInProgress) {
            const { task } = this.config

            if (!(await this.checkGuardrails(task, response))) {
                return
            }

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

        if (this.config.task.isStreamed) {
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
        this.config.fixupController.error(this.config.task.id, error)
    }

    private async handleFixupEdit(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.fixupController.didReceiveFixupText(
            this.config.task.id,
            responseTransformer(response, this.config.task, isMessageInProgress),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFixupInsert(response: string, isMessageInProgress: boolean): Promise<void> {
        return this.config.fixupController.didReceiveFixupInsertion(
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
            await this.config.fixupController.didReceiveNewFileRequest(this.config.task.id, newDoc.uri)
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
                await this.config.fixupController.didReceiveNewFileRequest(task.id, newFileUri)
            } catch (error) {
                this.handleError(new Error('Cody failed to generate unit tests', { cause: error }))
            }
        }
    }
}

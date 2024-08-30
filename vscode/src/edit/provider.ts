import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    Typewriter,
    isAbortError,
    isDotCom,
    modelsService,
    posixFilePaths,
    telemetryRecorder,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { logError } from '../log'
import type { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { authProvider, isNetworkError } from '../services/AuthProvider'

import {
    DEFAULT_EVENT_SOURCE,
    EventSourceTelemetryMetadataMapping,
} from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { workspace } from 'vscode'
import { doesFileExist } from '../commands/utils/workspace-files'
import { CodyTaskState } from '../non-stop/state'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
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

// Initiates a completion and responds to the result from the LLM. Implements
// "tools" like directing the response into a specific file. Code is forwarded
// to the FixupTask.
export class EditProvider {
    private insertionQueue: { response: string; isMessageInProgress: boolean }[] = []
    private insertionInProgress = false
    private abortController: AbortController | null = null

    constructor(public config: EditProviderOptions) {}

    public async startEdit(): Promise<void> {
        return wrapInActiveSpan('command.edit.start', async span => {
            this.config.controller.startTask(this.config.task)
            const model = this.config.task.model
            const contextWindow = modelsService.instance!.getContextWindowByID(model)
            const {
                messages,
                stopSequences,
                responseTopic,
                responsePrefix = '',
            } = await buildInteraction({
                model,
                codyApiVersion: authProvider.instance!.getAuthStatus().codyApiVersion,
                contextWindow: contextWindow.input,
                task: this.config.task,
                editor: this.config.editor,
            }).catch(err => {
                this.handleError(err)
                throw err
            })

            const multiplexer = new BotResponseMultiplexer()

            const typewriter = new Typewriter({
                update: content => {
                    void this.handleResponse(content, true)
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
                    void this.handleResponse(text, false)
                    return Promise.resolve()
                },
            })
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
                        // handleFileCreationResponse will verify if task.destinationFile is set before creating a new file.
                        void this.handleFileCreationResponse(filepath, true)
                        return Promise.resolve()
                    },
                    onTurnComplete: async () => {
                        return Promise.resolve()
                    },
                })
            }

            this.abortController = new AbortController()
            const stream = this.config.chat.chat(
                messages,
                {
                    model,
                    stopSequences,
                    maxTokensToSample: contextWindow.output,
                },
                this.abortController.signal
            )

            let textConsumed = 0
            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        if (textConsumed === 0 && responsePrefix) {
                            void multiplexer.publish(responsePrefix)
                        }
                        const text = message.text.slice(textConsumed)
                        textConsumed += text.length
                        void multiplexer.publish(text)
                        break
                    }
                    case 'complete': {
                        void multiplexer.notifyTurnComplete()
                        break
                    }
                    case 'error': {
                        let err = message.error
                        logError('EditProvider:onError', err.message)

                        if (isAbortError(err)) {
                            void this.handleResponse(text, false)
                            return
                        }

                        if (isNetworkError(err)) {
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
    }

    public abortEdit(): void {
        this.abortController?.abort()
    }

    /**
     * Given a response, allows applying an edit directly.
     * This is a shortcut to creating an edit without calling `executeEdit`.
     * Should **only** be used for completed edits.
     */
    public applyEdit(response: string): Promise<void> {
        // We need to start the task first, before applying
        this.config.controller.startTask(this.config.task)
        return this.handleResponse(response, false)
    }

    private async handleResponse(response: string, isMessageInProgress: boolean): Promise<void> {
        // Error state: The response finished but we didn't receive any text
        if (!response && !isMessageInProgress) {
            this.handleError(new Error('Cody did not respond with any text'))
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
            const endpoint = authProvider.instance!.getAuthStatus()?.endpoint
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
            this.processQueue()
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
        const currentFileName = uriBasename(currentFileUri)
        // remove open and close tags from text
        const newFilePath = text.trim().replaceAll(new RegExp(`${opentag}(.*)${closetag}`, 'g'), '$1')
        const haveSameExtensions =
            posixFilePaths.extname(currentFileName) === posixFilePaths.extname(newFilePath)

        // Get workspace uri using the current file uri
        const workspaceUri = workspace.getWorkspaceFolder(currentFileUri)?.uri
        const currentDirUri = Utils.joinPath(currentFileUri, '..')

        // Create a new file uri by replacing the file name of the currentFileUri with fileName
        let newFileUri = Utils.joinPath(workspaceUri ?? currentDirUri, newFilePath)
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

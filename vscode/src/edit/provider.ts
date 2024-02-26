import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    Typewriter,
    isAbortError,
    isDotCom,
    posixFilePaths,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import { convertFileUriToTestFileUri } from '../commands/utils/new-test-file'
import { logError } from '../log'
import type { FixupController } from '../non-stop/FixupController'
import type { FixupTask } from '../non-stop/FixupTask'
import { isNetworkError } from '../services/AuthProvider'

import { workspace } from 'vscode'
import { doesFileExist } from '../commands/utils/workspace-files'
import { getContextWindowForModel } from '../models/utilts'
import { CodyTaskState } from '../non-stop/utils'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import type { EditManagerOptions } from './manager'
import { buildInteraction } from './prompt'
import { PROMPT_TOPICS } from './prompt/constants'
import { contentSanitizer } from './utils'

interface EditProviderOptions extends EditManagerOptions {
    task: FixupTask
    controller: FixupController
}

export class EditProvider {
    private insertionResponse: string | null = null
    private insertionInProgress = false
    private insertionPromise: Promise<void> | null = null

    constructor(public config: EditProviderOptions) {}

    public async startEdit(): Promise<void> {
        return wrapInActiveSpan('command.edit.start', async span => {
            const model = this.config.task.model
            const contextWindow = getContextWindowForModel(
                this.config.authProvider.getAuthStatus(),
                model
            )
            const { messages, stopSequences, responseTopic, responsePrefix } = await buildInteraction({
                model,
                contextWindow,
                task: this.config.task,
                editor: this.config.editor,
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
                    typewriter.update(responsePrefix + text)
                    return Promise.resolve()
                },
                onTurnComplete: async () => {
                    typewriter.close()
                    typewriter.stop()
                    void this.handleResponse(text, false)
                    return Promise.resolve()
                },
            })

            // Listen to test file name suggestion from responses
            // Allows Cody to let us know which test file we should add the new content to
            if (this.config.task.intent === 'test') {
                let filepath = ''
                multiplexer.sub(PROMPT_TOPICS.FILENAME, {
                    onResponse: async (content: string) => {
                        filepath += content
                        void this.handleFileCreationResponse(filepath, true)
                        return Promise.resolve()
                    },
                    onTurnComplete: async () => {
                        return Promise.resolve()
                    },
                })
            }

            const abortController = new AbortController()
            const stream = this.config.chat.chat(
                messages,
                { model, stopSequences },
                abortController.signal
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
            telemetryService.log('CodyVSCodeExtension:fixupResponse:hasCode', {
                ...countCode(response),
                source: this.config.task.source,
                hasV2Event: true,
            })
            const endpoint = this.config.authProvider?.getAuthStatus()?.endpoint
            const responseText = endpoint && isDotCom(endpoint) ? response : undefined
            telemetryRecorder.recordEvent('cody.fixup.response', 'hasCode', {
                metadata: countCode(response),
                privateMetadata: {
                    source: this.config.task.source,
                    responseText,
                },
            })
        }

        const intentsForInsert = ['add', 'test']
        return intentsForInsert.includes(this.config.task.intent)
            ? this.handleFixupInsert(response, isMessageInProgress)
            : this.handleFixupEdit(response, isMessageInProgress)
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
            contentSanitizer(response),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFixupInsert(response: string, isMessageInProgress: boolean): Promise<void> {
        this.insertionResponse = response
        this.insertionInProgress = isMessageInProgress

        if (this.insertionPromise) {
            // Already processing an insertion, wait for it to finish
            return
        }

        return this.processInsertionQueue()
    }

    private async processInsertionQueue(): Promise<void> {
        while (this.insertionResponse !== null) {
            const responseToSend = this.insertionResponse
            this.insertionResponse = null

            this.insertionPromise = this.config.controller.didReceiveFixupInsertion(
                this.config.task.id,
                contentSanitizer(responseToSend),
                this.insertionInProgress ? 'streaming' : 'complete'
            )

            try {
                await this.insertionPromise
            } finally {
                this.insertionPromise = null
            }
        }
    }

    private async handleFileCreationResponse(text: string, isMessageInProgress: boolean): Promise<void> {
        const task = this.config.task
        if (task.state !== CodyTaskState.pending) {
            return
        }

        // Has already been created when set
        if (task.destinationFile) {
            return
        }

        // Manually create the file if no name was suggested
        if (!text.length && !isMessageInProgress) {
            // an existing test file from codebase
            const cbTestFileUri = task.contextMessages?.find(m => m?.file?.uri?.fsPath?.includes('test'))
                ?.file?.uri
            if (cbTestFileUri) {
                const testFileUri = convertFileUriToTestFileUri(task.fixupFile.uri, cbTestFileUri)
                const fileExists = await doesFileExist(testFileUri)
                // create a file uri with untitled scheme that would work on windows
                const newFileUri = fileExists ? testFileUri : testFileUri.with({ scheme: 'untitled' })
                await this.config.controller.didReceiveNewFileRequest(this.config.task.id, newFileUri)
                return
            }

            // Create a new untitled file if the suggested file does not exist
            const currentFile = task.fixupFile.uri
            const currentDoc = await workspace.openTextDocument(currentFile)
            const newDoc = await workspace.openTextDocument({ language: currentDoc?.languageId })
            await this.config.controller.didReceiveNewFileRequest(this.config.task.id, newDoc.uri)
            return
        }

        const opentag = `<${PROMPT_TOPICS.FILENAME}>`
        const closetag = `</${PROMPT_TOPICS.FILENAME}>`

        const currentFileUri = task.fixupFile.uri
        const currentFileName = uriBasename(currentFileUri)
        // remove open and close tags from text
        const newFileName = text.trim().replaceAll(new RegExp(`${opentag}(.*)${closetag}`, 'g'), '$1')
        const haveSameExtensions =
            posixFilePaths.extname(currentFileName) === posixFilePaths.extname(newFileName)

        // Create a new file uri by replacing the file name of the currentFileUri with fileName
        let newFileUri = Utils.joinPath(currentFileUri, '..', newFileName)
        if (haveSameExtensions && !task.destinationFile) {
            const fileIsFound = await doesFileExist(newFileUri)
            if (!fileIsFound) {
                newFileUri = newFileUri.with({ scheme: 'untitled' })
            }
            this.insertionPromise = this.config.controller.didReceiveNewFileRequest(task.id, newFileUri)
            try {
                await this.insertionPromise
            } catch (error) {
                this.handleError(new Error('Cody failed to generate unit tests', { cause: error }))
            } finally {
                this.insertionPromise = null
            }
        }
    }
}

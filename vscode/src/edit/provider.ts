import { Utils } from 'vscode-uri'

import {
    BotResponseMultiplexer,
    isAbortError,
    posixAndURIPaths,
    Typewriter,
    uriBasename,
} from '@sourcegraph/cody-shared'

import { convertFileUriToTestFileUri } from '../commands/utils/new-test-file'
import { logError } from '../log'
import type { FixupController } from '../non-stop/FixupController'
import { NewFixupFileMap } from '../non-stop/FixupFile'
import type { FixupTask } from '../non-stop/FixupTask'
import { isNetworkError } from '../services/AuthProvider'

import type { EditManagerOptions } from './manager'
import { buildInteraction } from './prompt'
import { PROMPT_TOPICS } from './prompt/constants'
import { contentSanitizer } from './utils'
import { doesFileExist } from '../commands/utils/workspace-files'

interface EditProviderOptions extends EditManagerOptions {
    task: FixupTask
    controller: FixupController
}

export class EditProvider {
    private cancelCompletionCallback: (() => void) | null = null

    private insertionResponse: string | null = null
    private insertionInProgress = false
    private insertionPromise: Promise<void> | null = null

    constructor(public config: EditProviderOptions) {}

    public async startEdit(): Promise<void> {
        // TODO: Allow users to change edit model
        const model = 'anthropic/claude-2.1'
        const { messages, stopSequences, responseTopic, responsePrefix } = await buildInteraction({
            model,
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

        // Listen to file name suggestion from responses
        // Allows Cody to let us know which file we should add the new content to
        if (this.config.task.mode === 'file') {
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
        this.cancelCompletionCallback = () => abortController.abort()
        const stream = this.config.chat.chat(messages, { model, stopSequences }, abortController.signal)

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
    }

    public abortEdit(): void {
        this.cancelCompletionCallback?.()
    }

    private async handleResponse(response: string, isMessageInProgress: boolean): Promise<void> {
        // Error state: The response finished but we didn't receive any text
        if (!response && !isMessageInProgress) {
            this.handleError(new Error('Cody did not respond with any text'))
        }

        if (!response) {
            return
        }

        // If the response finished and we didn't receive file name suggestion,
        // we will create one manually before inserting the response to the new file
        if (this.config.task.mode === 'file' && !NewFixupFileMap.get(this.config.task.id)) {
            if (isMessageInProgress) {
                return
            }
            await this.handleFileCreationResponse('', isMessageInProgress)
        }

        const intentsForInsert = ['add', 'new']
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
            }
            return
        }

        const opentag = `<${PROMPT_TOPICS.FILENAME}>`
        const closetag = `</${PROMPT_TOPICS.FILENAME}>`

        const currentFileUri = this.config.task.fixupFile.uri
        const currentFileName = uriBasename(currentFileUri)
        // remove open and close tags from text
        const newFileName = text.trim().replaceAll(new RegExp(`${opentag}(.*)${closetag}`, 'g'), '$1')
        const haveSameExtensions =
            posixAndURIPaths.extname(currentFileName) === posixAndURIPaths.extname(newFileName)

        // Create a new file uri by replacing the file name of the currentFileUri with fileName
        let newFileUri = Utils.joinPath(currentFileUri, '..', newFileName)

        if (haveSameExtensions && !NewFixupFileMap.get(task.id)) {
            const fileIsFound = await doesFileExist(newFileUri)
            if (!fileIsFound) {
                newFileUri = newFileUri.with({ scheme: 'untitled' })
            }
            this.insertionPromise = this.config.controller.didReceiveNewFileRequest(
                this.config.task.id,
                newFileUri
            )
            try {
                await this.insertionPromise
            } finally {
                this.insertionPromise = null
            }
        }
    }
}

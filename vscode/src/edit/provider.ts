import * as uuid from 'uuid'

import { ChatMessage } from '@sourcegraph/cody-shared'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { contentSanitizer } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'

import { MessageProviderOptions } from '../chat/MessageProvider'
import { VSCodeEditor } from '../editor/vscode-editor'
import { FixupTask } from '../non-stop/FixupTask'

interface EditProviderOptions extends MessageProviderOptions {
    task: FixupTask
}

export class EditProvider {
    private task: FixupTask
    private editor: VSCodeEditor
    private chat: ChatClient
    private cancelCompletionCallback: (() => void) | null = null

    private insertionResponse: string | null = null
    private insertionInProgress = false
    private insertionPromise: Promise<void> | null = null

    constructor({ task, editor, chat }: EditProviderOptions) {
        this.task = task
        this.editor = editor
        this.chat = chat
    }

    public async startFix(): Promise<void> {
        const requestID = uuid.v4()
        // this.currentRequestID = requestID

        // Create a new multiplexer to drop any old subscribers
        const multiplexer = new BotResponseMultiplexer()

        const prompt = ''
        // const { prompt, chatModel } = buildPrompt()

        let text = ''

        multiplexer.sub('CODE5711', {
            onResponse: async (content: string) => {
                text += content
                console.log('Got content', content)
                return Promise.resolve()
            },
            onTurnComplete: async () => {
                console.log('Finished', text)
                return Promise.resolve()
            },
        })

        let textConsumed = 0

        this.cancelCompletionCallback = this.chat.chat(
            [],
            {
                onChange: text => {
                    // if (textConsumed === 0 && responsePrefix) {
                    //     void multiplexer.publish(responsePrefix)
                    // }

                    // TODO(dpc): The multiplexer can handle incremental text. Change chat to provide incremental text.
                    text = text.slice(textConsumed)
                    textConsumed += text.length
                    void multiplexer.publish(text)
                },
                onComplete: () => {
                    void multiplexer.notifyTurnComplete()
                },
                onError: (err, statusCode) => {
                    // TODO notify the multiplexer of the error
                    // logError('ChatViewProvider:onError', err.message)

                    // if (isAbortError(err)) {
                    //     this.isMessageInProgress = false
                    //     this.sendTranscript()
                    //     return
                    // }

                    // if (isNetworkError(err)) {
                    //     err = new Error('Cody could not respond due to network error.')
                    // }

                    // Display error message as assistant response
                    // this.handleError(err, 'transcript')
                    // We ignore embeddings errors in this instance because we're already showing an
                    // error message and don't want to overwhelm the user.
                    // void this.onCompletionEnd(true)
                    console.error(`Completion request failed: ${err.message}`)
                },
            }
            // { model: this.chatModel, stopSequences: recipe.stopSequences }
        )

        await this.executeRecipe('fixup', this.task.id, this.task.source)
    }

    public async abortFix(): Promise<void> {
        await this.abortCompletion()
    }

    /**
     * Send transcript to the fixup
     */
    protected async handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): Promise<void> {
        const lastMessage = transcript.at(-1)

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        // Error state: The transcript finished but we didn't receive any text
        if (!lastMessage.displayText && !isMessageInProgress) {
            this.handleError(new Error('Cody did not respond with any text'))
        }

        if (!lastMessage.displayText) {
            return
        }

        return this.task.intent === 'add'
            ? this.handleFixupInsert(lastMessage.displayText, isMessageInProgress)
            : this.handleFixupEdit(lastMessage.displayText, isMessageInProgress)
    }

    private async handleFixupEdit(response: string, isMessageInProgress: boolean): Promise<void> {
        const controller = this.editor.controllers.fixups
        if (!controller) {
            return
        }
        return controller.didReceiveFixupText(
            this.task.id,
            contentSanitizer(response),
            isMessageInProgress ? 'streaming' : 'complete'
        )
    }

    private async handleFixupInsert(response: string, isMessageInProgress: boolean): Promise<void> {
        const controller = this.editor.controllers.fixups
        if (!controller) {
            return
        }

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

            const controller = this.editor.controllers.fixups
            if (!controller) {
                return
            }

            this.insertionPromise = controller.didReceiveFixupInsertion(
                this.task.id,
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

    /**
     * Display an erred codelens to the user on failed fixup apply.
     * Will allow the user to view the error in more detail if needed.
     */
    protected handleError(error: Error): void {
        this.editor.controllers.fixups?.error(this.task.id, error)
    }
}

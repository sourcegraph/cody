import { BotResponseMultiplexer } from '@sourcegraph/cody-shared/src/chat/bot-response-multiplexer'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { logError } from '../log'
import { FixupController } from '../non-stop/FixupController'
import { FixupTask } from '../non-stop/FixupTask'
import { isNetworkError } from '../services/AuthProvider'

import { EditManagerOptions } from './manager'
import { buildInteraction } from './prompt'
import { contentSanitizer } from './utils'

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
            context: this.config.contextProvider.context,
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

        let textConsumed = 0
        this.cancelCompletionCallback = this.config.chat.chat(
            messages,
            {
                onChange: text => {
                    if (textConsumed === 0 && responsePrefix) {
                        void multiplexer.publish(responsePrefix)
                    }
                    text = text.slice(textConsumed)
                    textConsumed += text.length
                    void multiplexer.publish(text)
                },
                onComplete: () => {
                    void multiplexer.notifyTurnComplete()
                },
                onError: err => {
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
                },
            },
            { model, stopSequences }
        )
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

        return this.config.task.intent === 'add'
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
}

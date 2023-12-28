import { contentSanitizer } from '@sourcegraph/cody-shared/src/chat/recipes/helpers'
import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { FixupTask } from '../non-stop/FixupTask'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'

export class FixupManager {
    private fixupProviders = new Map<FixupTask, FixupProvider>()
    private messageProviderOptions: MessageProviderOptions

    constructor(options: MessageProviderOptions) {
        this.messageProviderOptions = options
    }

    public getProviderForTask(task: FixupTask): FixupProvider {
        let provider = this.fixupProviders.get(task)

        if (!provider) {
            provider = new FixupProvider({ task, ...this.messageProviderOptions })
            this.fixupProviders.set(task, provider)
        }

        return provider
    }

    public removeProviderForTask(task: FixupTask): void {
        const provider = this.fixupProviders.get(task)

        if (provider) {
            this.fixupProviders.delete(task)
            provider.dispose()
        }
    }
}

interface FixupProviderOptions extends MessageProviderOptions {
    task: FixupTask
}

export class FixupProvider extends MessageProvider {
    private task: FixupTask
    private insertionResponse: string | null = null
    private insertionInProgress = false
    private insertionPromise: Promise<void> | null = null

    constructor({ task, ...options }: FixupProviderOptions) {
        super(options)
        this.task = task
    }

    public async startFix(): Promise<void> {
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

    protected handleCodyCommands(): void {
        // not implemented
    }

    protected handleHistory(): void {
        // not implemented
    }

    protected handleSuggestions(): void {
        // not implemented
    }

    protected handleMyPrompts(): void {
        // not implemented
    }
}

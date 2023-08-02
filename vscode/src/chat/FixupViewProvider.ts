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
            provider.removeFix()
            provider.dispose()
        }
    }
}

interface FixupProviderOptions extends MessageProviderOptions {
    task: FixupTask
}

export class FixupProvider extends MessageProvider {
    private task: FixupTask

    constructor({ task, ...options }: FixupProviderOptions) {
        super(options)
        this.task = task
    }

    public async startFix({ fast }: { fast: boolean }): Promise<void> {
        await this.executeRecipe('fixup', this.task.id, { fast })
    }

    public async abortFix(): Promise<void> {
        // this.editor.controllers.inline?.abort()
        await this.abortCompletion()
    }

    public removeFix(): void {
        // this.editor.controllers.inline?.delete(this.thread)
    }

    private formatResponse(response: string): string {
        const cursorPosition = this.task.selectionRange.start.character
        const firstCharacterOfResponsePosition = getFirstNonWhitespaceCharacterPosition(response)

        // Cody returned where we expected
        if (firstCharacterOfResponsePosition === null || cursorPosition === firstCharacterOfResponsePosition) {
            return response
        }

        // We didn't return where we wanted, let's pad each line
        const paddingDistance = cursorPosition - firstCharacterOfResponsePosition
        const paddedResponse = response
            .split('\n')
            .map(line => line.padStart(line.length + paddingDistance))
            .join('\n')

        // Finally return the trimmed response ready for insertion at the cursor
        return paddedResponse.trimStart()
    }

    /**
     * Send transcript to the fixup
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        if (lastMessage.displayText) {
            void this.editor.controllers.fixups?.didReceiveFixupText(
                this.task.id,
                isMessageInProgress ? lastMessage.displayText : this.formatResponse(lastMessage.displayText),
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }
    }

    /**
     * Display error message in the active inline chat thread..
     * Unlike the sidebar, this message is displayed as an assistant response.
     * TODO(umpox): Should we render these differently for inline chat? We are limited in UI options.
     */
    protected handleError(errorMsg: string): void {
        void this.editor.controllers.inline?.error(errorMsg)
    }

    protected handleHistory(): void {
        // not implemented
    }

    protected handleSuggestions(): void {
        // not implemented
    }

    protected handleEnabledPlugins(): void {
        // not implemented
    }

    protected handleMyPrompts(): void {
        // not implemented
    }
}

enum CharCode {
    Tab = 9,
    Space = 32,
}

export function getFirstNonWhitespaceCharacterPosition(text: string): number | null {
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i)
        if (char !== CharCode.Space && char !== CharCode.Tab) {
            return i
        }
    }

    return null
}

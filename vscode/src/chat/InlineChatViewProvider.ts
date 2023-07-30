import * as vscode from 'vscode'

import { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { MessageProvider, MessageProviderOptions } from './MessageProvider'

export class InlineChatViewManager {
    private inlineChatThreadProviders = new Map<vscode.CommentThread, InlineChatViewProvider>()
    private messageProviderOptions: MessageProviderOptions

    constructor(options: MessageProviderOptions) {
        this.messageProviderOptions = options
    }

    public getProviderForThread(thread: vscode.CommentThread): InlineChatViewProvider {
        let provider = this.inlineChatThreadProviders.get(thread)

        if (!provider) {
            provider = new InlineChatViewProvider({ thread, ...this.messageProviderOptions })
            this.inlineChatThreadProviders.set(thread, provider)
        }

        return provider
    }

    public removeProviderForThread(thread: vscode.CommentThread): void {
        const provider = this.inlineChatThreadProviders.get(thread)

        if (provider) {
            this.inlineChatThreadProviders.delete(thread)
            provider.removeChat()
            provider.dispose()
        }
    }
}

interface InlineChatViewProviderOptions extends MessageProviderOptions {
    thread: vscode.CommentThread
}

export class InlineChatViewProvider extends MessageProvider {
    private thread: vscode.CommentThread

    constructor({ thread, ...options }: InlineChatViewProviderOptions) {
        super(options)
        this.thread = thread
    }

    public async addChat(reply: string, isFixMode: boolean): Promise<void> {
        // TODO(umpox): We use `inline.reply.pending` to gate against multiple inline chats being sent at once.
        // We need to update the comment controller to support more than one active thread at a time.
        void vscode.commands.executeCommand('setContext', 'cody.inline.reply.pending', true)

        await this.editor.controllers.inline?.chat(reply, this.thread, isFixMode)
        this.editor.controllers.inline?.setResponsePending(true)
        await this.executeRecipe('inline-chat', reply.trimStart())
    }

    public removeChat(): void {
        this.editor.controllers.inline?.delete(this.thread)
    }

    public async abortChat(): Promise<void> {
        this.editor.controllers.inline?.abort()
        await this.abortCompletion()
        void vscode.commands.executeCommand('setContext', 'cody.inline.reply.pending', false)
    }

    /**
     * Send transcript to the active inline chat thread.
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        if (lastMessage.displayText) {
            this.editor.controllers.inline?.setResponsePending(false)
            this.editor.controllers.inline?.reply(
                lastMessage.displayText,
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }

        if (!isMessageInProgress) {
            // Finished responding, we can allow users to send another inline chat message.
            void vscode.commands.executeCommand('setContext', 'cody.inline.reply.pending', false)
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
        // navigating history not yet implemented for inline chat
    }

    protected handleSuggestions(): void {
        // showing suggestions not yet implemented for inline chat
    }

    protected handleEnabledPlugins(): void {
        // plugins not yet implemented for inline chat
    }

    protected handleMyPrompts(): void {
        // my prompts not yet implemented for inline chat
    }

    protected handleTranscriptErrors(): void {
        // handle transcript errors not yet implemented for inline chat
    }
}

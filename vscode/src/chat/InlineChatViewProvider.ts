import * as vscode from 'vscode'

import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { MessageProvider, MessageProviderOptions } from './MessageProvider'

const getUniqueKeyForCommentThread = (thread: vscode.CommentThread): string =>
    `${thread.uri.path}:L${thread.range.start.line}C${thread.range.start.character}-L${thread.range.end.line}C${thread.range.end.character}`

export class InlineChatViewManager {
    private inlineChatThreadProviders = new Map<string, InlineChatViewProvider>()
    private messageProviderOptions: MessageProviderOptions

    constructor(options: MessageProviderOptions) {
        this.messageProviderOptions = options
    }

    public getProviderForThread(thread: vscode.CommentThread): InlineChatViewProvider {
        const threadKey = getUniqueKeyForCommentThread(thread)
        let provider = this.inlineChatThreadProviders.get(threadKey)

        if (!provider) {
            provider = new InlineChatViewProvider({ thread, ...this.messageProviderOptions })
            this.inlineChatThreadProviders.set(threadKey, provider)
        }

        return provider
    }
}

interface InlineChatViewProviderOptions extends MessageProviderOptions {
    thread: vscode.CommentThread
}

export class InlineChatViewProvider extends MessageProvider {
    public static webview?: ChatViewProviderWebview
    private thread: vscode.CommentThread

    constructor({ thread, ...options }: InlineChatViewProviderOptions) {
        super(options)
        this.thread = thread
    }

    public async addChat(reply: string, isFixMode: boolean): Promise<void> {
        // TODO(umpox): We use `inline.reply.pending` to gate against multiple inline chats being sent at once.
        // We need to update the comment controller to support more than one active thread at a time.
        void vscode.commands.executeCommand('setContext', 'cody.inline.reply.pending', true)

        await this.editor.controllers.inline.chat(reply, this.thread, isFixMode)
        this.editor.controllers.inline.setResponsePending(true)
        await this.executeRecipe('inline-chat', reply.trimStart())
    }

    public removeChat(): void {
        this.editor.controllers.inline.delete(this.thread)
    }

    public async abortChat(): Promise<void> {
        this.editor.controllers.inline.abort()
        await this.abortCompletion()
    }

    /**
     * Send transcript to the active inline chat thread.
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // If we have nothing to show, do nothing.
        // Note that we only care about the assistants response.
        // The users' messages are already added through the comments API.
        if (lastMessage?.speaker !== 'assistant') {
            return
        }

        if (lastMessage.displayText) {
            this.editor.controllers.inline.setResponsePending(false)
            this.editor.controllers.inline.reply(
                lastMessage.displayText,
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }

        if (!isMessageInProgress) {
            // Finished completing, we can allow users to send another inline chat message.
            void vscode.commands.executeCommand('setContext', 'cody.inline.reply.pending', false)
        }
    }

    /**
     * Display error message in the active inline chat thread..
     * Unlike the sidebar, this message is displayed as an assistant response.
     * We don't yet have a good way to render errors separately in the inline chat window.
     */
    protected handleError(errorMsg: string): void {
        void this.editor.controllers.inline.error(errorMsg)
    }

    /**
     * Sends chat history to webview.
     * Note: The sidebar is the only current way to navigate chat history.
     * This is ensure that users can still find old inline chats from previous sessions.
     */
    protected handleHistory(history: UserLocalHistory): void {
        void InlineChatViewProvider.webview?.postMessage({
            type: 'history',
            messages: history,
        })
    }

    protected handleSuggestions(): void {
        // suggestions are not yet implemented for inline chat
    }
}

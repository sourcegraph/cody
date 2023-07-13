import * as vscode from 'vscode'

import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { MessageProvider } from './MessageProvider'

export class InlineChatViewProvider extends MessageProvider {
    public webview?: ChatViewProviderWebview
    private activeThread?: vscode.CommentThread
    private inlineChats = new Map<vscode.Uri, string>()

    public async addChat(reply: string, thread: vscode.CommentThread, isFixMode: boolean): Promise<void> {
        this.activeThread = thread
        const existingChatID = this.getChatIDForThread(this.activeThread)

        if (existingChatID) {
            // Restore context from the previous chat
            await this.restoreSession(existingChatID)
        } else {
            await this.clearAndRestartSession()
            this.inlineChats.set(this.activeThread.uri, this.currentChatID)
        }

        await this.editor.controllers.inline.chat(reply, thread, isFixMode)
        this.editor.controllers.inline.setResponsePending(true)
        await this.executeRecipe('inline-chat', reply.trimStart())
    }

    public removeChat(thread: vscode.CommentThread): void {
        this.inlineChats.delete(thread.uri)
        this.editor.controllers.inline.delete(thread)
    }

    public getChatIDForThread(thread: vscode.CommentThread): string | undefined {
        return this.inlineChats.get(thread.uri)
    }

    /**
     * Send transcript to the active inline chat thread.
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1]

        // If the thread we're targeting doesn't match the controllers thread, do nothing
        if (this.activeThread && this.activeThread?.uri !== this.editor.controllers.inline.thread?.uri) {
            return
        }

        if (lastMessage?.displayText) {
            this.editor.controllers.inline.reply(
                lastMessage.displayText,
                isMessageInProgress ? 'streaming' : 'complete'
            )
        }
    }

    /**
     * Display error message in the active inline chat thread..
     * Unlike the sidebar, this message is displayed as an assistant response.
     * We don't yet have a good way to render errors separately in the inline chat window.
     * TODO: Can we render this as a label?
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
        void this.webview?.postMessage({
            type: 'history',
            messages: history,
        })
    }

    protected handleSuggestions(): void {
        // suggestions are not yet implemented for inline chat
    }
}

import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { ChatViewProviderWebview } from './ChatViewProvider'
import { MessageProvider } from './MessageProvider'

export class InlineChatViewProvider extends MessageProvider {
    public webview?: ChatViewProviderWebview

    /**
     * Send transcript to the active inline chat thread.
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        const lastMessage = transcript[transcript.length - 1].displayText

        if (lastMessage) {
            this.editor.controllers.inline.reply(lastMessage, isMessageInProgress ? 'streaming' : 'complete')
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

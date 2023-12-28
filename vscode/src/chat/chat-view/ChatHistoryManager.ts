import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { localStorage } from '../../services/LocalStorageProvider'
import { AuthStatus } from '../protocol'

export class ChatHistoryManager {
    public getLocalHistory(authStatus: AuthStatus): UserLocalHistory | null {
        return localStorage.getChatHistory(authStatus)
    }

    public getChat(authStatus: AuthStatus, sessionID: string): TranscriptJSON | null {
        const chatHistory = this.getLocalHistory(authStatus)
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    public async saveChat(authStatus: AuthStatus, chat: TranscriptJSON, input?: string): Promise<UserLocalHistory> {
        const history = localStorage.getChatHistory(authStatus)
        history.chat[chat.id] = chat
        if (input) {
            history.input.push(input)
        }
        await localStorage.setChatHistory(authStatus, history)
        return history
    }

    public async deleteChat(authStatus: AuthStatus, chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(authStatus, chatID)
    }

    // HumanInputHistory is the history list when user presses "up" in the chat input box
    public async saveHumanInputHistory(authStatus: AuthStatus, input: string): Promise<UserLocalHistory> {
        const history = localStorage.getChatHistory(authStatus)
        history.input.push(input)
        await localStorage.setChatHistory(authStatus, history)
        return history
    }
    public getHumanInputHistory(authStatus: AuthStatus): string[] {
        const history = localStorage.getChatHistory(authStatus)
        if (!history) {
            return []
        }
        return history.input
    }

    // Remove chat history and input history
    public async clear(authStatus: AuthStatus): Promise<void> {
        await localStorage.removeChatHistory(authStatus)
    }
}

export const chatHistory = new ChatHistoryManager()

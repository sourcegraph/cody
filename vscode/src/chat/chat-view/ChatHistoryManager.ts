import type { AuthStatus, SerializedChatTranscript, UserLocalHistory } from '@sourcegraph/cody-shared'

import { localStorage } from '../../services/LocalStorageProvider'

export class ChatHistoryManager {
    public getLocalHistory(authStatus: AuthStatus): Promise<UserLocalHistory | null> {
        return localStorage.getChatHistory(authStatus)
    }

    public async getChat(authStatus: AuthStatus, sessionID: string): Promise<SerializedChatTranscript | null> {
        const chatHistory = await this.getLocalHistory(authStatus)
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    public async saveChat(
        authStatus: AuthStatus,
        chat: SerializedChatTranscript
    ): Promise<UserLocalHistory> {
        const history = await localStorage.getChatHistory(authStatus)
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(authStatus, history)
        return history
    }

    public async deleteChat(authStatus: AuthStatus, chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(authStatus, chatID)
    }

    // Remove chat history and input history
    public async clear(authStatus: AuthStatus): Promise<void> {
        await localStorage.removeChatHistory(authStatus)
    }
}

export const chatHistory = new ChatHistoryManager()

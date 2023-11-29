import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { localStorage } from '../../services/LocalStorageProvider'

export class ChatHistoryManager {
    public getChat(sessionID: string): TranscriptJSON | null {
        const chatHistory = localStorage.getChatHistory()
        if (!chatHistory) {
            return null
        }

        return chatHistory.chat[sessionID]
    }

    public async saveChat(chat: TranscriptJSON): Promise<UserLocalHistory> {
        let history = localStorage.getChatHistory()
        if (!history) {
            history = {
                chat: {},
                input: [],
            }
        }
        const chatTitle = this.getChatTitle(chat.id)
        history.chat[chat.id] = chat
        if (chatTitle) {
            history.chat[chat.id].chatTitle = chatTitle
        }
        await localStorage.setChatHistory(history)
        return history
    }
    public getChatTitle(chatID: string): string | undefined {
        const chatHistory = localStorage.getChatHistory()
        const userChat = chatHistory?.chat[chatID]
        let chatTitle
        if (userChat) {
            chatTitle = userChat.chatTitle
        }
        return chatTitle
    }
    public async updateChatHistoryTitle(chatID: string, message: string): Promise<void> {
        const userHistory = localStorage.getChatHistory()
        const userChat = userHistory?.chat[chatID]
        if (userChat) {
            userChat.chatTitle = message
            userHistory.chat[chatID] = userChat
            await localStorage.setChatHistory(userHistory)
        }
    }
}

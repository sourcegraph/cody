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
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(history)
        return history
    }

    public async deleteChat(chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(chatID)
    }

    // Remove chat history with input history
    public async clear(): Promise<void> {
        await localStorage.removeChatHistory()
    }

    public async saveInput(input: string): Promise<UserLocalHistory> {
        let history = localStorage.getChatHistory()
        if (!history) {
            history = {
                chat: {},
                input: [],
            }
        }
        history.input.push(input)
        await localStorage.setChatHistory(history)
        return history
    }

    public getInput(): string[] {
        const history = localStorage.getChatHistory()
        if (!history) {
            return []
        }
        return history.input
    }
}

export const chatHistory = new ChatHistoryManager()

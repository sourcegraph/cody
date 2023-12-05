import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { localStorage } from '../../services/LocalStorageProvider'

export class ChatHistoryManager {
    public get localHistory(): UserLocalHistory | null {
        return localStorage.getChatHistory()
    }

    public getChat(sessionID: string): TranscriptJSON | null {
        const chatHistory = this.localHistory
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    public async saveChat(chat: TranscriptJSON): Promise<UserLocalHistory> {
        const history = localStorage.getChatHistory()
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(history)
        return history
    }

    public async deleteChat(chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(chatID)
    }

    // HumanInputHistory is the history list when user presses "up" in the chat input box
    public async saveHumanInputHistory(input: string): Promise<UserLocalHistory> {
        const history = localStorage.getChatHistory()
        history.input.push(input)
        await localStorage.setChatHistory(history)
        return history
    }
    public getHumanInputHistory(): string[] {
        const history = localStorage.getChatHistory()
        if (!history) {
            return []
        }
        return history.input
    }

    // Remove chat history and input history
    public async clear(): Promise<void> {
        await localStorage.removeChatHistory()
    }
}

export const chatHistory = new ChatHistoryManager()

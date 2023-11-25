import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

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
}

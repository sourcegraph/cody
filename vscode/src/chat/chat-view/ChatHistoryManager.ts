import type { AuthStatus, SerializedChatTranscript, UserLocalHistory } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'

export class ChatHistoryManager implements vscode.Disposable {
    private historyChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.disposables.push(this.historyChanged)
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

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
        this.historyChanged.fire()
        return history
    }

    public onHistoryChanged(listener: () => any): vscode.Disposable {
        return this.historyChanged.event(listener)
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

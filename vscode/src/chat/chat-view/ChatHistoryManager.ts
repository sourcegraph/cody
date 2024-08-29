import type {
    AccountKeyedChatHistory,
    AuthStatus,
    SerializedChatTranscript,
    UserLocalHistory,
} from '@sourcegraph/cody-shared'

import { debounce } from 'lodash'
import * as vscode from 'vscode'
import { localStorage } from '../../services/LocalStorageProvider'

class ChatHistoryManager implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private historyChanged = new vscode.EventEmitter<UserLocalHistory | null>()

    constructor() {
        this.disposables.push(this.historyChanged)
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    public getLocalHistory(authStatus: AuthStatus): UserLocalHistory | null {
        return localStorage.getChatHistory(authStatus)
    }

    public getChat(authStatus: AuthStatus, sessionID: string): SerializedChatTranscript | null {
        const chatHistory = this.getLocalHistory(authStatus)
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    public async saveChat(
        authStatus: AuthStatus,
        chat: SerializedChatTranscript | undefined
    ): Promise<UserLocalHistory> {
        const history = localStorage.getChatHistory(authStatus)
        if (chat === undefined) {
            return history
        }
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(authStatus, history)
        this.notifyChatHistoryChanged(authStatus)
        return history
    }

    public async importChatHistory(
        history: AccountKeyedChatHistory,
        merge: boolean,
        authStatus: AuthStatus
    ): Promise<void> {
        await localStorage.importChatHistory(history, merge)
        this.notifyChatHistoryChanged(authStatus)
    }

    public async deleteChat(authStatus: AuthStatus, chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(authStatus, chatID)
        this.notifyChatHistoryChanged(authStatus)
    }

    // Remove chat history and input history
    public async clear(authStatus: AuthStatus): Promise<void> {
        await localStorage.removeChatHistory(authStatus)
        this.notifyChatHistoryChanged(authStatus)
    }

    public onHistoryChanged(listener: (chatHistory: UserLocalHistory | null) => any): vscode.Disposable {
        return this.historyChanged.event(listener)
    }

    private notifyChatHistoryChanged = debounce(
        authStatus => this.historyChanged.fire(this.getLocalHistory(authStatus)),
        100,
        { leading: true, trailing: true }
    )
}

export const chatHistory = new ChatHistoryManager()

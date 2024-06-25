import { debounce } from 'lodash'
import * as vscode from 'vscode'

import type {
    AuthStatus,
    Disposable,
    SerializedChatTranscript,
    UserLocalHistory,
} from '@sourcegraph/cody-shared'

import { localStorage } from '../../services/LocalStorageProvider'

export type ChatHistoryUpdate = UserLocalHistory | null

export class ChatHistoryManager implements vscode.Disposable {
    private historyChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    private disposables: vscode.Disposable[] = []

    private eventEmitter: vscode.EventEmitter<UserLocalHistory | null> =
        new vscode.EventEmitter<UserLocalHistory | null>()

    constructor() {
        this.disposables.push(this.historyChanged)
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    // The way to observer/subscribe on the chat history updates
    // Primary is used for the agent mode, in order to catch chat history
    // updates and send them to the agent's client
    public onDidChatHistoryChange(callback: (chatHistory: UserLocalHistory | null) => void): Disposable {
        return this.eventEmitter.event(callback)
    }

    public getLocalHistory(authStatus: AuthStatus): Promise<UserLocalHistory | null> {
        return localStorage.getChatHistory(authStatus)
    }

    public async getChat(
        authStatus: AuthStatus,
        sessionID: string
    ): Promise<SerializedChatTranscript | null> {
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

        // Notify chat history subscriber that chat history has been updated
        this.notifyChatHistoryChanged(authStatus)
        this.historyChanged.fire()

        return history
    }

    private notifyChatHistoryChanged = debounce(
        async authStatus => this.eventEmitter.fire(await this.getLocalHistory(authStatus)),
        200,
        { maxWait: 10000, leading: true }
    )

    public onHistoryChanged(listener: () => any): vscode.Disposable {
        return this.historyChanged.event(listener)
    }

    public async deleteChat(authStatus: AuthStatus, chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(authStatus, chatID)

        // Notify chat history subscriber that chat history has been updated
        this.eventEmitter.fire(await this.getLocalHistory(authStatus))
    }

    // Remove chat history and input history
    public async clear(authStatus: AuthStatus): Promise<void> {
        await localStorage.removeChatHistory(authStatus)

        // Notify chat history subscriber that chat history has been updated
        this.eventEmitter.fire(await this.getLocalHistory(authStatus))
    }
}

export const chatHistory = new ChatHistoryManager()

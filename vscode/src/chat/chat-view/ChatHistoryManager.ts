import {
    type AccountKeyedChatHistory,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type LightweightUserHistory,
    type SerializedChatTranscript,
    type UnauthenticatedAuthStatus,
    type UserLocalHistory,
    authStatus,
    combineLatest,
    distinctUntilChanged,
    startWith,
} from '@sourcegraph/cody-shared'
import { type Observable, Subject, map } from 'observable-fns'
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

    public getLocalHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>
    ): UserLocalHistory | null {
        return localStorage.getChatHistory(authStatus)
    }

    /**
     * Converts the full chat history to a lightweight version containing only the essential data
     * needed for display in the UI.
     */
    public getLightweightHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>
    ): LightweightUserHistory | null {
        const fullHistory = this.getLocalHistory(authStatus)
        if (!fullHistory) {
            return null
        }

        const lightweightHistory: LightweightUserHistory = { chat: {} }

        // Convert each chat to lightweight format
        for (const [chatId, chat] of Object.entries(fullHistory.chat)) {
            // Skip empty chats
            if (!chat.interactions.length) {
                continue
            }

            // Truncate the human message text if it's too long
            const MAX_CHAT_TITLE_CHAR_LENGTH = 200
            const truncate = (text?: string) =>
                text ? text.slice(0, MAX_CHAT_TITLE_CHAR_LENGTH) + '...' : 'New Chat'

            // Get the first human message text (for fallback title)
            const firstInteraction = chat.interactions[0]
            const firstHumanMessageText = truncate(firstInteraction.humanMessage.text)

            const lastInteraction = chat.interactions[chat.interactions.length - 1]
            const lastHumanMessageText = truncate(lastInteraction.humanMessage.text)

            lightweightHistory.chat[chatId] = {
                id: chat.id,
                chatTitle: chat.chatTitle || firstHumanMessageText,
                lastInteractionTimestamp: chat.lastInteractionTimestamp,
                lastHumanMessageText,
            }
        }

        return lightweightHistory
    }

    public getChat(
        authStatus: AuthenticatedAuthStatus,
        sessionID: string
    ): SerializedChatTranscript | null {
        const chatHistory = this.getLocalHistory(authStatus)
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    public async saveChat(
        authStatus: AuthenticatedAuthStatus,
        chat: SerializedChatTranscript
    ): Promise<void> {
        // Don't save empty chats
        if (chat.interactions.length > 0) {
            const history = localStorage.getChatHistory(authStatus)
            history.chat[chat.id] = chat
            await localStorage.setChatHistory(authStatus, history)
            this.changeNotifications.next()
        }
    }

    public async importChatHistory(
        history: AccountKeyedChatHistory,
        merge: boolean,
        authStatus: AuthStatus
    ): Promise<void> {
        await localStorage.importChatHistory(history, merge)
        this.changeNotifications.next()
    }

    public async deleteChat(authStatus: AuthenticatedAuthStatus, chatID: string): Promise<void> {
        await localStorage.deleteChatHistory(authStatus, chatID)
        this.changeNotifications.next()
    }

    // Remove chat history and input history
    public async clear(authStatus: AuthenticatedAuthStatus): Promise<void> {
        await localStorage.removeChatHistory(authStatus)
        this.changeNotifications.next()
    }

    private changeNotifications = new Subject<void>()

    /**
     * Observable that emits the lightweight version of user chat history whenever it changes.
     * This is used to send minimal data to the webview to improve performance.
     */
    public changes: Observable<LightweightUserHistory | null> = combineLatest(
        authStatus.pipe(
            // Only need to rere-fetch the chat history when the endpoint or username changes for
            // authed users (i.e., when they switch to a different account), not when anything else
            // in the authStatus might change.
            map(
                (
                    authStatus
                ):
                    | UnauthenticatedAuthStatus
                    | Pick<AuthenticatedAuthStatus, 'authenticated' | 'endpoint' | 'username'> =>
                    authStatus.authenticated
                        ? {
                              authenticated: authStatus.authenticated,
                              endpoint: authStatus.endpoint,
                              username: authStatus.username,
                          }
                        : authStatus
            ),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(
        map(([authStatus]) => (authStatus.authenticated ? this.getLightweightHistory(authStatus) : null))
    )

    /**
     * Original observable that emits the full user chat history (kept for backward compatibility)
     * @deprecated Use changes instead which provides a lightweight version for better performance
     */
    public fullChanges: Observable<UserLocalHistory | null> = combineLatest(
        authStatus.pipe(
            map(
                (
                    authStatus
                ):
                    | UnauthenticatedAuthStatus
                    | Pick<AuthenticatedAuthStatus, 'authenticated' | 'endpoint' | 'username'> =>
                    authStatus.authenticated
                        ? {
                              authenticated: authStatus.authenticated,
                              endpoint: authStatus.endpoint,
                              username: authStatus.username,
                          }
                        : authStatus
            ),
            distinctUntilChanged()
        ),
        this.changeNotifications.pipe(startWith(undefined))
    ).pipe(map(([authStatus]) => (authStatus.authenticated ? this.getLocalHistory(authStatus) : null)))
}

export const chatHistory = new ChatHistoryManager()

import {
    type AccountKeyedChatHistory,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type SerializedChatTranscript,
    type UnauthenticatedAuthStatus,
    type UserLocalHistory,
    authStatus,
    combineLatest,
    distinctUntilChanged,
    startWith,
} from '@sourcegraph/cody-shared'
import {
    type LightweightChatHistory,
    toLightweightChatTranscript,
} from '@sourcegraph/cody-shared/src/chat/transcript'
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

    public getChat(
        authStatus: AuthenticatedAuthStatus,
        sessionID: string
    ): SerializedChatTranscript | null {
        const chatHistory = this.getLocalHistory(authStatus)
        return chatHistory?.chat ? chatHistory.chat[sessionID] : null
    }

    /**
     * Returns a lightweight version of the chat history containing only the essential data
     * needed for displaying in the history list (title, ID, timestamp).
     *
     * @param authStatus The authenticated user status
     * @param limit Optional limit on the number of history items to return (default: 20)
     * @returns A lightweight version of the chat history or null if not available
     */
    public getLightweightHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>,
        limit = 20
    ): LightweightChatHistory | null {
        const history = this.getLocalHistory(authStatus)
        if (!history?.chat) {
            return null
        }

        // Convert full history to lightweight history
        const lightweightHistory: LightweightChatHistory = {}

        // Get all chat IDs, sort by timestamp (newest first), and limit
        const chatIDs = Object.keys(history.chat)
            .sort((a, b) => {
                const timestampA = new Date(history.chat[a].lastInteractionTimestamp).getTime()
                const timestampB = new Date(history.chat[b].lastInteractionTimestamp).getTime()
                return timestampB - timestampA // Descending order (newest first)
            })
            .slice(0, limit)

        // Convert each chat to lightweight format
        for (const chatID of chatIDs) {
            if (!history.chat[chatID]?.interactions?.length) {
                // Remove empty chats
                continue
            }
            lightweightHistory[chatID] = toLightweightChatTranscript(history.chat[chatID])
        }

        return lightweightHistory
    }

    public async saveChat(
        authStatus: AuthenticatedAuthStatus,
        chat: SerializedChatTranscript
    ): Promise<void> {
        // Don't save empty chat
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
        _authStatus: AuthStatus
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
    public changes: Observable<UserLocalHistory | null> = combineLatest(
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
    ).pipe(map(([authStatus]) => (authStatus.authenticated ? this.getLocalHistory(authStatus) : null)))

    /**
     * Observable that emits a lightweight version of the chat history
     * containing only essential data for the history list.
     */
    public lightweightChanges: Observable<LightweightChatHistory | null> = combineLatest(
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
    ).pipe(
        map(([authStatus]) => (authStatus.authenticated ? this.getLightweightHistory(authStatus) : null))
    )
}

export const chatHistory = new ChatHistoryManager()

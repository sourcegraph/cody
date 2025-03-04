import {
    type AccountKeyedChatHistory,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type LightweightUserHistory,
    type PaginatedHistoryResult,
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
                text ? text.slice(0, MAX_CHAT_TITLE_CHAR_LENGTH) : 'New Chat'

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
                model: lastInteraction.assistantMessage?.model,
                intent: lastInteraction.humanMessage?.intent,
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

    /**
     * Gets a paginated portion of the chat history in lightweight format.
     * Supports searching with an optional search term.
     * @param authStatus Authentication status
     * @param page Page number (1-based)
     * @param pageSize Number of items per page
     * @param searchTerm Optional search term to filter chats
     */
    public getPaginatedHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>,
        page: number,
        pageSize: number,
        searchTerm?: string
    ): PaginatedHistoryResult {
        // Get lightweight history first
        const history = this.getLightweightHistory(authStatus)
        if (!history) {
            return {
                items: [],
                totalCount: 0,
                currentPage: page,
                pageSize: pageSize,
                hasNextPage: false,
            }
        }

        // Convert map to array and sort by timestamp (newest first)
        let items = Object.values(history.chat).sort((a, b) => {
            return (
                new Date(b.lastInteractionTimestamp).getTime() -
                new Date(a.lastInteractionTimestamp).getTime()
            )
        })

        // Apply search filter if provided
        if (searchTerm && searchTerm.trim() !== '') {
            const term = searchTerm.trim().toLowerCase()
            items = items.filter(chat => {
                const titleText = chat.chatTitle?.toLowerCase()
                const messageText = chat.lastHumanMessageText?.toLowerCase()

                return titleText?.includes(term) || messageText?.includes(term)
            })
        }

        // Calculate pagination
        const totalCount = items.length
        const startIndex = (page - 1) * pageSize
        const endIndex = Math.min(startIndex + pageSize, totalCount)
        const pageItems = items.slice(startIndex, endIndex)
        const hasNextPage = endIndex < totalCount

        return {
            items: pageItems,
            totalCount,
            currentPage: page,
            pageSize,
            hasNextPage,
        }
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
     * @deprecated Use paginatedChanges() instead for better performance with large chat histories
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
     * Returns an Observable that emits a paginated portion of chat history.
     * This provides better performance by only loading the items needed for the current view.
     *
     * @param page Page number (1-based)
     * @param pageSize Number of items per page
     * @param searchTerm Optional search term to filter chats
     */
    public paginatedChanges(
        page: number,
        pageSize: number,
        searchTerm?: string
    ): Observable<PaginatedHistoryResult> {
        return combineLatest(
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
            map(([authStatus]) => {
                if (!authStatus.authenticated) {
                    return {
                        items: [],
                        totalCount: 0,
                        currentPage: page,
                        pageSize: pageSize,
                        hasNextPage: false,
                    }
                }

                return this.getPaginatedHistory(authStatus, page, pageSize, searchTerm)
            })
        )
    }

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

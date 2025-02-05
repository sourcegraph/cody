import {
    type AccountKeyedChatHistory,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type SerializedChatTranscript,
    type UnauthenticatedAuthStatus,
    type UserLocalHistory,
    authStatus,
    catchError,
    combineLatest,
    distinctUntilChanged,
    isError,
    skipPendingOperation,
    startWith,
    threadService,
} from '@sourcegraph/cody-shared'
import { Observable, Subject, map } from 'observable-fns'
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

    public async getChat(
        authStatus: AuthenticatedAuthStatus,
        sessionID: string
    ): Promise<SerializedChatTranscript | null> {
        const thread = await threadService.getThread(Number.parseInt(sessionID))
        return thread ? threadService.toTranscript(thread) : null
    }

    public getChatLocal(
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
        if (chat.id) {
            await threadService.updateThread(Number.parseInt(chat.id), { data: JSON.stringify(chat) })
        } else {
            const created = await threadService.createThread({ data: JSON.stringify(chat) })
            chat.id = created.id.toString()
        }
        this.changeNotifications.next()
    }

    public async saveChatLocal(
        authStatus: AuthenticatedAuthStatus,
        chat: SerializedChatTranscript
    ): Promise<void> {
        const history = localStorage.getChatHistory(authStatus)
        history.chat[chat.id] = chat
        await localStorage.setChatHistory(authStatus, history)
        this.changeNotifications.next()
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
    public changesLocal: Observable<UserLocalHistory | null> = combineLatest(
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

    public changes: Observable<UserLocalHistory | null> = combineLatest(
        this.changesLocal,
        threadService.observeThreads().pipe(
            skipPendingOperation(),
            catchError(err => Observable.of([]))
        )
    ).pipe(
        map(([localThreads, remoteThreads]) => {
            const all = localThreads ?? { chat: {} }
            if (remoteThreads && !isError(remoteThreads))
                for (const thread of remoteThreads) {
                    all.chat[thread.id.toString()] = threadService.toTranscript(thread)
                }
            return all
        })
    )
}

export const chatHistory = new ChatHistoryManager()

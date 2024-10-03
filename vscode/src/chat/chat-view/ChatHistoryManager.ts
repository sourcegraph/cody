import {
    type AccountKeyedChatHistory,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type SerializedChatTranscript,
    type UnauthenticatedAuthStatus,
    type UserLocalHistory,
    authStatus,
    combineLatest,
    currentAuthStatus,
    distinctUntilChanged,
    logError,
    startWith,
    telemetryRecorder,
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
}

export const chatHistory = new ChatHistoryManager()

/**
 * Export chat history to file system
 */
export async function exportHistory(): Promise<void> {
    telemetryRecorder.recordEvent('cody.exportChatHistoryButton', 'clicked', {
        billingMetadata: {
            product: 'cody',
            category: 'billable',
        },
    })
    const authStatus = currentAuthStatus()
    if (authStatus.authenticated) {
        try {
            const historyJson = chatHistory.getLocalHistory(authStatus)
            const exportPath = await vscode.window.showSaveDialog({
                title: 'Cody: Export Chat History',
                filters: { 'Chat History': ['json'] },
            })
            if (!exportPath || !historyJson) {
                return
            }
            const logContent = new TextEncoder().encode(JSON.stringify(historyJson))
            await vscode.workspace.fs.writeFile(exportPath, logContent)
            // Display message and ask if user wants to open file
            void vscode.window
                .showInformationMessage('Chat history exported successfully.', 'Open')
                .then(choice => {
                    if (choice === 'Open') {
                        void vscode.commands.executeCommand('vscode.open', exportPath)
                    }
                })
        } catch (error) {
            logError('ChatsController:exportHistory', 'Failed to export chat history', error)
        }
    }
}

import { debounce } from 'lodash'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID,
    type ChatClient,
    type Guardrails,
    STATE_VERSION_CURRENT,
    lexicalEditorStateFromPromptString,
} from '@sourcegraph/cody-shared'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { View } from '../../../webviews/NavBar'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'

import { DEFAULT_EVENT_SOURCE } from '@sourcegraph/cody-shared'
import type { URI } from 'vscode-uri'
import type { ExecuteChatArguments } from '../../commands/execute/ask'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import type { ContextRankingController } from '../../local-context/context-ranking'
import type { ChatSession } from './ChatController'
import { ChatPanelsManager, type SidebarViewOptions } from './ChatPanelsManager'

export const CodyChatPanelViewType = 'cody.chatPanel'

/**
 * Manages the sidebar webview for auth/onboarding.
 *
 * TODO(sqs): rename from its legacy name ChatManager
 */
export class ChatManager implements vscode.Disposable {
    public readonly chatPanelsManager: ChatPanelsManager

    private options: SidebarViewOptions

    private disposables: vscode.Disposable[] = []

    constructor(
        { extensionUri, ...options }: SidebarViewOptions,
        private chatClient: ChatClient,
        private enterpriseContext: EnterpriseContextFactory,
        private localEmbeddings: LocalEmbeddingsController | null,
        private contextRanking: ContextRankingController | null,
        private symf: SymfRunner | null,
        private guardrails: Guardrails
    ) {
        logDebug(
            'ChatManager:constructor',
            'init',
            localEmbeddings ? 'has local embeddings controller' : 'no local embeddings'
        )
        this.options = { extensionUri, ...options }

        this.chatPanelsManager = new ChatPanelsManager(
            this.options,
            this.chatClient,
            this.localEmbeddings,
            this.contextRanking,
            this.symf,
            this.enterpriseContext,
            this.guardrails
        )

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.action.chat', args => this.executeChat(args)),
            vscode.commands.registerCommand('cody.chat.focusView', () =>
                vscode.commands.executeCommand('cody.chat.focus')
            ),
            vscode.commands.registerCommand('cody.chat.signIn', () =>
                vscode.commands.executeCommand('cody.chat.focus')
            ),
            vscode.commands.registerCommand(
                'cody.chat.moveToEditor',
                async () => await this.chatPanelsManager.moveChatToEditor()
            ),
            vscode.commands.registerCommand(
                'cody.chat.moveFromEditor',
                async () => await this.chatPanelsManager.moveChatFromEditor()
            ),
            vscode.commands.registerCommand('cody.chat.newPanel', async () => {
                await this.chatPanelsManager.resetSidebar()
                await vscode.commands.executeCommand('cody.chat.focus')
            }),
            vscode.commands.registerCommand('cody.chat.newEditorPanel', () =>
                this.createNewWebviewPanel()
            ),
            vscode.commands.registerCommand('cody.chat.history.export', () => this.exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', () => this.clearHistory()),
            vscode.commands.registerCommand('cody.chat.history.delete', item => this.clearHistory(item)),
            vscode.commands.registerCommand('cody.chat.panel.restore', (id, chat) =>
                this.restorePanel(id, chat)
            ),
            vscode.commands.registerCommand(CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID, (...args) =>
                this.passthroughVsCodeOpen(...args)
            ),

            // Mention selection/file commands
            vscode.commands.registerCommand('cody.mention.selection', uri =>
                this.sendEditorContextToChat(uri)
            ),
            vscode.commands.registerCommand('cody.mention.file', uri =>
                this.sendEditorContextToChat(uri)
            )
        )
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        await this.chatPanelsManager.syncAuthStatus(authStatus)
    }

    public async setWebviewView(view: View): Promise<void> {
        // Chat panel is only used for chat view
        // Request to open chat panel for login view/unAuth users, will be sent to sidebar view
        if (!this.options.authProvider.getAuthStatus()?.isLoggedIn || view !== 'chat') {
            return vscode.commands.executeCommand('cody.chat.focus')
        }

        const chatProvider = await this.chatPanelsManager.getNewChatPanel()
        await chatProvider?.setWebviewView(view)
    }

    /**
     * Execute a chat request in a new chat panel
     */
    public async executeChat({
        text,
        submitType,
        contextFiles,
        addEnhancedContext,
        source = DEFAULT_EVENT_SOURCE,
        command,
    }: ExecuteChatArguments): Promise<ChatSession | undefined> {
        const provider = await this.chatPanelsManager.getNewChatPanel()
        const abortSignal = provider.startNewSubmitOrEditOperation()
        const editorState = lexicalEditorStateFromPromptString(text)
        await provider.handleUserMessageSubmission(
            uuid.v4(),
            text,
            submitType,
            contextFiles ?? [],
            {
                lexicalEditorState: editorState,
                v: STATE_VERSION_CURRENT,
                minReaderV: STATE_VERSION_CURRENT,
            },
            addEnhancedContext ?? true,
            abortSignal,
            source,
            command
        )
        return provider
    }

    private async sendEditorContextToChat(uri?: URI): Promise<void> {
        telemetryRecorder.recordEvent('cody.addChatContext', 'clicked')

        const provider = await this.chatPanelsManager.getActiveChatPanel()
        await provider.handleGetUserEditorContext(uri)
    }

    private async clearHistory(treeItem?: vscode.TreeItem): Promise<void> {
        const chatID = treeItem?.id
        if (chatID) {
            await this.chatPanelsManager.clearHistory(chatID)
            return
        }

        if (!treeItem) {
            logDebug('ChatManager:clearHistory', 'userConfirmation')
            // Show warning to users and get confirmation if they want to clear all history
            const userConfirmation = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all of your chats?',
                { modal: true },
                'Delete All Chats'
            )

            if (!userConfirmation) {
                return
            }

            await this.chatPanelsManager.clearHistory()
        }
    }

    /**
     * Export chat history to file system
     */
    private async exportHistory(): Promise<void> {
        telemetryRecorder.recordEvent('cody.exportChatHistoryButton', 'clicked')
        const historyJson = localStorage.getChatHistory(this.options.authProvider.getAuthStatus())?.chat
        const exportPath = await vscode.window.showSaveDialog({
            filters: { 'Chat History': ['json'] },
        })
        if (!exportPath || !historyJson) {
            return
        }
        try {
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
            logError('ChatManager:exportHistory', 'Failed to export chat history', error)
        }
    }

    public async revive(panel: vscode.WebviewPanel, chatID: string): Promise<void> {
        try {
            await this.chatPanelsManager.createWebviewPanel(chatID, panel.title, panel)
        } catch (error) {
            console.error('revive failed', error)
            logDebug('ChatManager:revive', 'failed', { verbose: error })

            // When failed, create a new panel with restored session and dispose the old panel
            await this.restorePanel(chatID, panel.title)
            panel.dispose()
        }
    }

    /**
     * See docstring for {@link CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID}.
     */
    private async passthroughVsCodeOpen(...args: unknown[]): Promise<void> {
        if (args[1] && (args[1] as any).viewColumn === vscode.ViewColumn.Beside) {
            // Make vscode.ViewColumn.Beside work as expected from a webview: open it to the side,
            // instead of always opening a new editor to the right.
            //
            // If the active editor is undefined, that means the chat panel is the active editor, so
            // we will open the file in the first visible editor instead.
            const textEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]
            ;(args[1] as any).viewColumn = textEditor ? textEditor.viewColumn : vscode.ViewColumn.Beside
        }
        if (args[1] && Array.isArray((args[1] as any).selection)) {
            // Fix a weird issue where the selection was getting encoded as a JSON array, not an
            // object.
            ;(args[1] as any).selection = new vscode.Selection(
                (args[1] as any).selection[0],
                (args[1] as any).selection[1]
            )
        }
        await vscode.commands.executeCommand('vscode.open', ...args)
    }

    private disposeChatPanelsManager(): void {
        void vscode.commands.executeCommand('setContext', CodyChatPanelViewType, false)
        this.chatPanelsManager.dispose()
    }

    // For registering the commands for chat panels in advance
    private async createNewWebviewPanel(): Promise<ChatSession | undefined> {
        const debounceCreatePanel = debounce(() => this.chatPanelsManager.createWebviewPanel(), 250, {
            leading: true,
            trailing: true,
        })

        if (this.chatPanelsManager) {
            return debounceCreatePanel()
        }
        return undefined
    }

    private async restorePanel(chatID: string, chatQuestion?: string): Promise<ChatSession | undefined> {
        const debounceRestore = debounce(
            async (chatID: string, chatQuestion?: string) =>
                this.chatPanelsManager.restorePanel(chatID, chatQuestion),
            250,
            { leading: true, trailing: true }
        )

        if (this.chatPanelsManager) {
            return debounceRestore(chatID, chatQuestion)
        }
        return undefined
    }

    public dispose(): void {
        this.disposeChatPanelsManager()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

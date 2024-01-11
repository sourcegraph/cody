import { debounce } from 'lodash'
import * as vscode from 'vscode'

import { ChatModelProvider, type CodyCommand } from '@sourcegraph/cody-shared'
import { type ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { type ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { type View } from '../../../webviews/NavBar'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import { type LocalEmbeddingsController } from '../../local-context/local-embeddings'
import { type SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { type CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'
import { type AuthStatus } from '../protocol'

import { ChatPanelsManager } from './ChatPanelsManager'
import { SidebarViewController, type SidebarViewOptions } from './SidebarViewController'
import { type ChatSession, type SimpleChatPanelProvider } from './SimpleChatPanelProvider'

export const CodyChatPanelViewType = 'cody.chatPanel'
/**
 * Manages the sidebar webview for auth/onboarding.
 *
 * TODO(sqs): rename from its legacy name ChatManager
 */
export class ChatManager implements vscode.Disposable {
    // SidebarView is used for auth view and running tasks that do not require a chat view
    // We will always keep an instance of this around (even when not visible) to handle states when no panels are open
    public sidebarViewController: SidebarViewController
    private chatPanelsManager: ChatPanelsManager

    private options: SidebarViewOptions

    private disposables: vscode.Disposable[] = []

    constructor(
        { extensionUri, ...options }: SidebarViewOptions,
        private chatClient: ChatClient,
        private embeddingsClient: CachedRemoteEmbeddingsClient,
        private localEmbeddings: LocalEmbeddingsController | null,
        private symf: SymfRunner | null
    ) {
        logDebug(
            'ChatManager:constructor',
            'init',
            localEmbeddings ? 'has local embeddings controller' : 'no local embeddings'
        )
        this.options = { extensionUri, ...options }

        this.sidebarViewController = new SidebarViewController(this.options)

        this.chatPanelsManager = new ChatPanelsManager(
            this.options,
            this.chatClient,
            this.embeddingsClient,
            this.localEmbeddings,
            this.symf
        )

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.history.export', async () => this.exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', async () => this.clearHistory()),
            vscode.commands.registerCommand('cody.chat.history.delete', async item => this.clearHistory(item)),
            vscode.commands.registerCommand('cody.chat.history.edit', async item => this.editChatHistory(item)),
            vscode.commands.registerCommand('cody.chat.panel.new', async () => this.createNewWebviewPanel()),
            vscode.commands.registerCommand('cody.chat.panel.restore', (id, chat) => this.restorePanel(id, chat)),
            vscode.commands.registerCommand('cody.chat.open.file', async fsPath => this.openFileFromChat(fsPath))
        )
    }

    private async getChatProvider(): Promise<SimpleChatPanelProvider> {
        const provider = await this.chatPanelsManager.getChatPanel()
        return provider
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        if (authStatus?.configOverwrites?.chatModel) {
            ChatModelProvider.add(new ChatModelProvider(authStatus.configOverwrites.chatModel))
        }
        await this.chatPanelsManager.syncAuthStatus(authStatus)
    }

    public async setWebviewView(view: View): Promise<void> {
        const chatProvider = await this.getChatProvider()
        await chatProvider?.setWebviewView(view)
    }

    public async executeCommand(command: CodyCommand, source: ChatEventSource): Promise<ChatSession | undefined> {
        logDebug('ChatManager:executeCommand:called', command.slashCommand)
        if (!vscode.window.visibleTextEditors.length) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        // Else, open a new chanel panel and run the command in the new panel
        const chatProvider = await this.getChatProvider()
        await chatProvider.handleCommands(command, source)
        return chatProvider
    }

    private async editChatHistory(treeItem?: vscode.TreeItem): Promise<void> {
        const chatID = treeItem?.id
        const chatLabel = treeItem?.label as vscode.TreeItemLabel
        if (chatID) {
            await this.chatPanelsManager.editChatHistory(chatID, chatLabel.label)
        }
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
     * Clears the current chat session and restarts it, creating a new chat ID.
     */
    public async clearAndRestartSession(): Promise<void> {
        await this.chatPanelsManager.clearAndRestartSession()
    }

    /**
     * Export chat history to file system
     */
    private async exportHistory(): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:exportChatHistoryButton:clicked', undefined, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.exportChatHistoryButton', 'clicked')
        const historyJson = localStorage.getChatHistory(this.options.authProvider.getAuthStatus())?.chat
        const exportPath = await vscode.window.showSaveDialog({ filters: { 'Chat History': ['json'] } })
        if (!exportPath || !historyJson) {
            return
        }
        try {
            const logContent = new TextEncoder().encode(JSON.stringify(historyJson))
            await vscode.workspace.fs.writeFile(exportPath, logContent)
            // Display message and ask if user wants to open file
            void vscode.window.showInformationMessage('Chat history exported successfully.', 'Open').then(choice => {
                if (choice === 'Open') {
                    void vscode.commands.executeCommand('vscode.open', exportPath)
                }
            })
        } catch (error) {
            logError('ChatManager:exportHistory', 'Failed to export chat history', error)
        }
    }

    public async simplifiedOnboardingReloadEmbeddingsState(): Promise<void> {
        await this.sidebarViewController.simplifiedOnboardingReloadEmbeddingsState()
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

    public async triggerNotice(notice: { key: string }): Promise<void> {
        const provider = await this.getChatProvider()
        provider.webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible) {
                void provider?.webview?.postMessage({
                    type: 'notice',
                    notice,
                })
            }
        })
    }

    private async openFileFromChat(uriAndRange: string): Promise<void> {
        const rangeIndex = uriAndRange.indexOf(':range:')
        const range = rangeIndex ? uriAndRange.slice(Math.max(0, rangeIndex + 7)) : 0
        const uriStr = range ? uriAndRange.slice(0, rangeIndex) : uriAndRange
        const uri = vscode.Uri.parse(uriStr)
        // If the active editor is undefined, that means the chat panel is the active editor
        // so we will open the file in the first visible editor instead
        const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]
        // If there is no editor or visible editor found, then we will open the file next to chat panel
        const viewColumn = editor ? editor.viewColumn : vscode.ViewColumn.Beside
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { viewColumn })
    }

    private disposeChatPanelsManager(): void {
        void vscode.commands.executeCommand('setContext', CodyChatPanelViewType, false)
        this.options.contextProvider.webview = this.sidebarViewController.webview
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
            async (chatID: string, chatQuestion?: string) => this.chatPanelsManager.restorePanel(chatID, chatQuestion),
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
        this.disposables.forEach(d => d.dispose())
    }
}

/**
 * Set HTML for webview (panel) & webview view (sidebar)
 */
export async function addWebviewViewHTML(
    extensionUri: vscode.Uri,
    view: vscode.WebviewView | vscode.WebviewPanel
): Promise<void> {
    if (isRunningInsideAgent()) {
        return
    }
    const webviewPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webviews')
    // Create Webview using vscode/index.html
    const root = vscode.Uri.joinPath(webviewPath, 'index.html')
    const bytes = await vscode.workspace.fs.readFile(root)
    const decoded = new TextDecoder('utf-8').decode(bytes)
    const resources = view.webview.asWebviewUri(webviewPath)

    // This replace variables from the vscode/dist/index.html with webview info
    // 1. Update URIs to load styles and scripts into webview (eg. path that starts with ./)
    // 2. Update URIs for content security policy to only allow specific scripts to be run
    view.webview.html = decoded
        .replaceAll('./', `${resources.toString()}/`)
        .replaceAll('{cspSource}', view.webview.cspSource)
}

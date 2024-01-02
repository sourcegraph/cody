import { debounce } from 'lodash'
import * as vscode from 'vscode'

import { ChatModelProvider } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../../webviews/NavBar'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'
import { AuthStatus } from '../protocol'

import { ChatPanelsManager, IChatPanelProvider } from './ChatPanelsManager'
import { SidebarViewController, SidebarViewOptions } from './SidebarViewController'

export const CodyChatPanelViewType = 'cody.chatPanel'
/**
 * Manages chat view providers and panels.
 */
export class ChatManager implements vscode.Disposable {
    // SidebarView is used for auth view and running tasks that do not require a chat view
    // We will always keep an instance of this around (even when not visible) to handle states when no panels are open
    public sidebarViewController: SidebarViewController
    private chatPanelsManager: ChatPanelsManager

    private options: SidebarViewOptions

    protected disposables: vscode.Disposable[] = []

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

    private async getChatProvider(): Promise<IChatPanelProvider> {
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

    /**
     * Executes a recipe in a view provider.
     */
    public async executeRecipe(
        recipeId: RecipeID,
        humanChatInput: string,
        openChatView = true,
        source?: ChatEventSource
    ): Promise<void> {
        logDebug('ChatManager:executeRecipe:called', recipeId)
        if (!vscode.window.visibleTextEditors.length) {
            void vscode.window.showErrorMessage('Please open a file before running a command.')
            return
        }

        // If chat view is not needed, run the recipe via sidebar view without creating a new panel
        const isDefaultEditCommands = ['/doc', '/edit'].includes(humanChatInput)
        if (!openChatView || isDefaultEditCommands) {
            await this.sidebarViewController.executeRecipe(recipeId, humanChatInput, source)
            return
        }

        // Else, open a new chanel panel and run the command in the new panel
        const chatProvider = await this.getChatProvider()
        await chatProvider.executeRecipe(recipeId, humanChatInput, source)
    }

    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        logDebug('ChatManager:executeCustomCommand:called', title)
        const customPromptActions = ['add', 'get', 'menu']
        if (!customPromptActions.includes(title)) {
            await this.executeRecipe('custom-prompt', title, true)
            return
        }

        const chatProvider = await this.getChatProvider()
        await chatProvider.executeCustomCommand(title, type)
    }

    public async editChatHistory(treeItem?: vscode.TreeItem): Promise<void> {
        const chatID = treeItem?.id
        const chatLabel = treeItem?.label as vscode.TreeItemLabel
        if (chatID) {
            await this.chatPanelsManager.editChatHistory(chatID, chatLabel.label)
        }
    }

    public async clearHistory(treeItem?: vscode.TreeItem): Promise<void> {
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

    public async restoreSession(chatID: string): Promise<void> {
        const chatProvider = await this.getChatProvider()
        await chatProvider.restoreSession(chatID)
    }

    /**
     * Export chat history to file system
     */
    public async exportHistory(): Promise<void> {
        // Use sidebar chat view for non-chat-session specfic actions
        await this.sidebarViewController.exportHistory()
    }

    public async simplifiedOnboardingReloadEmbeddingsState(): Promise<void> {
        await this.sidebarViewController.simplifiedOnboardingReloadEmbeddingsState()
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(chatID?: string, chatQuestion?: string): Promise<IChatPanelProvider | undefined> {
        logDebug('ChatManager:createWebviewPanel', 'creating')
        return this.chatPanelsManager.createWebviewPanel(chatID, chatQuestion)
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

    private async openFileFromChat(fsPath: string): Promise<void> {
        const rangeIndex = fsPath.indexOf(':range:')
        const range = rangeIndex ? fsPath.slice(Math.max(0, rangeIndex + 7)) : 0
        const filteredFsPath = range ? fsPath.slice(0, rangeIndex) : fsPath
        const uri = vscode.Uri.file(filteredFsPath)
        // If the active editor is undefined, that means the chat panel is the active editor
        // so we will open the file in the first visible editor instead
        const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]
        // If there is no editor or visible editor found, then we will open the file next to chat panel
        const viewColumn = editor ? editor.viewColumn : vscode.ViewColumn.Beside
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { viewColumn })
    }

    private disposeChatPanelsManager(): void {
        this.options.contextProvider.webview = this.sidebarViewController.webview
        this.chatPanelsManager.dispose()
    }

    // For registering the commands for chat panels in advance
    private async createNewWebviewPanel(): Promise<void> {
        const debounceCreatePanel = debounce(
            async () => {
                await this.chatPanelsManager.createWebviewPanel()
            },
            250,
            { leading: true, trailing: true }
        )

        if (this.chatPanelsManager) {
            await debounceCreatePanel()
        }
    }

    private async restorePanel(chatID: string, chatQuestion?: string): Promise<void> {
        const debounceRestore = debounce(
            async (chatID: string, chatQuestion?: string) => {
                await this.chatPanelsManager.restorePanel(chatID, chatQuestion)
            },
            250,
            { leading: true, trailing: true }
        )

        if (this.chatPanelsManager) {
            await debounceRestore(chatID, chatQuestion)
        }
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

import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../webviews/NavBar'
import { localStorage } from '../services/LocalStorageProvider'
import { createCodyChatTreeItems, TreeViewProvider } from '../services/TreeViewProvider'

import { ChatPanelProvider } from './ChatPanelProvider'
import { ChatViewProvider } from './ChatViewProvider'
import { MessageProviderOptions } from './MessageProvider'

interface ChatViewProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
}
/**
 * Manages chat view providers and panels.
 *
 * - Maintains sidebar and panel chat view provider instances.
 * - Handles creating, disposing, and switching between them.
 * - Provides methods to execute commands in the active provider.
 * - Stores panel providers mapped to their session ID.
 * - Switches chat view provider on config changes.
 * - Registers chat view-related commands and tree view.
 */
export class ChatViewManager implements vscode.Disposable {
    private currentProvider: ChatViewProvider | ChatPanelProvider
    // View in sidebar for auth flow and old chat sidebar view
    // We will always keep an instance of this around (even when not visible) to handle states when no panels are open
    private sidebarViewProvider: ChatViewProvider
    // Chat views in editor panels when experimentalChatPanel is enabled
    private chatPanelProviders: Map<string, ChatPanelProvider> = new Map()

    private isPanelViewEnabled = false

    private options: ChatViewProviderOptions
    private onConfigurationChange: vscode.Disposable

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat')
    public treeView

    protected disposables: vscode.Disposable[] = []

    constructor({ extensionUri, ...options }: ChatViewProviderOptions) {
        this.options = { extensionUri, ...options }
        this.isPanelViewEnabled = options.contextProvider.config.experimentalChatPanel

        this.treeView = vscode.window.createTreeView('cody.chat.tree.view', {
            treeDataProvider: this.treeViewProvider,
        })

        this.sidebarViewProvider = new ChatViewProvider({ extensionUri, ...options })
        this.currentProvider = this.sidebarViewProvider

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.panel.new', async () => this.createWebviewPanel()),
            vscode.commands.registerCommand('cody.chat.panel.restore', async id => this.restorePanel(id)),
            vscode.commands.registerCommand('cody.chat.history.export', async () => this.exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', async () => this.clearHistory()),
            vscode.commands.registerCommand('cody.chat.history.delete', async item => this.clearHistory(item)),
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeViewProvider)
        )

        const localHistory = localStorage.getChatHistory()
        if (localHistory && this.isPanelViewEnabled) {
            this.treeViewProvider.updateTree(
                createCodyChatTreeItems({
                    chat: localHistory?.chat,
                    input: localHistory.input,
                })
            )
        }

        // Register config change listener
        this.onConfigurationChange = options.contextProvider.configurationChangeEvent.event(async () => {
            const isChatPanelEnabled = options.contextProvider.config.experimentalChatPanel
            this.isPanelViewEnabled = isChatPanelEnabled
            // When chat.chatPanel is set to true, the sidebar chat view will never be shown
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', isChatPanelEnabled)
            if (!isChatPanelEnabled) {
                // when config is disabled, remove all panels
                this.disposePanels()
                return
            }

            // Remove provider  that doesn't have webPanel anymore
            this.chatPanelProviders.forEach((provider, id) => {
                if (!provider.webviewPanel) {
                    provider.dispose()
                    this.chatPanelProviders.delete(id)
                }
            })
        })
    }

    public get sidebarChat(): ChatViewProvider {
        return this.sidebarViewProvider
    }

    public async syncAuthStatus(): Promise<void> {
        const authStatus = this.options.authProvider.getAuthStatus()
        if (!authStatus.isLoggedIn) {
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', false)
            this.disposePanels()
        }
    }

    /**
     * Gets the current chat provider instance for chat-session specific actions.
     *
     * Checks currentProvider first.
     * If not set, defaults to sidebarViewProvider.
     * Sets currentProvider to the returned provider.
     */
    private async getChatProvider(isChatViewRequired = false): Promise<ChatViewProvider | ChatPanelProvider> {
        if (!this.isPanelViewEnabled) {
            return this.sidebarChat
        }

        // Create a panel only if chat view is required and no panels exist
        if (isChatViewRequired && !this.chatPanelProviders.size) {
            await this.createWebviewPanel()
        }

        const provider = this.currentProvider || this.sidebarChat
        this.currentProvider = provider
        return this.currentProvider
    }

    /**
     * Creates a new webview panel for chat.
     *
     * Checks if chat panel is enabled in config.
     * Creates a ChatPanelProvider with options.
     * Calls ChatPanelProvider.createWebviewPanel() to create the panel.
     * Stores the panel provider mapped to its session ID.
     * Sets panel provider as current provider.
     * Handles view state change events to track current panel.
     * Handles dispose events to clean up panel provider.
     * Restarts the chat session after creating the panel.
     *
     * Returns the created ChatPanelProvider instance.
     */
    public async createWebviewPanel(chatID?: string): Promise<ChatPanelProvider | undefined> {
        if (!this.isPanelViewEnabled) {
            return undefined
        }

        const options = {
            treeView: this.treeViewProvider,
            ...this.options,
        }
        const provider = new ChatPanelProvider(options)

        const webviewPanel = await provider.createWebviewPanel(chatID)
        if (!webviewPanel) {
            provider.dispose()
            return
        }

        const sessionID = chatID || provider.currentChatID
        this.currentProvider = provider
        this.chatPanelProviders.set(sessionID, provider)

        webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.currentProvider = provider
                const chat = this.treeViewProvider.getTreeItemByID(provider.currentChatID)
                if (chat) {
                    void this.treeView?.reveal(chat, { select: true })
                }
            }
        })

        webviewPanel?.onDidDispose(() => {
            const provider = this.chatPanelProviders.get(sessionID)
            provider?.dispose()
            this.chatPanelProviders.delete(sessionID)
        })

        return provider
    }

    public async setWebviewView(view: View): Promise<void> {
        if (!this.isPanelViewEnabled) {
            await this.sidebarChat.setWebviewView(view)
            return
        }

        // All new commands will start in an empty chat session
        // NOTE: webview panel does not have views other than 'chat'
        if (view === 'chat') {
            await this.createWebviewPanel()
        }
    }

    /**
     * Executes a recipe in the chat view.
     */
    public async executeRecipe(
        recipeId: RecipeID,
        humanChatInput: string,
        openChatView = true,
        source?: ChatEventSource
    ): Promise<void> {
        if (openChatView) {
            // This will create a new panel if experimentalChatPanel is enabled
            await this.setWebviewView('chat')
        }

        if (!this.isPanelViewEnabled) {
            await this.sidebarChat.executeRecipe(recipeId, humanChatInput, source)
            return
        }

        // Run command in a new webview to avoid conflicts with context from exisiting chat
        // Only applies when commands are run outside of chat input box
        const chatProvider = await this.getChatProvider(openChatView)
        await chatProvider.executeRecipe(recipeId, humanChatInput, source)
    }

    /**
     * Executes a custom command action.
     *
     * Checks if the title matches a valid custom command action.
     * If not, opens the chat view.
     * Otherwise retrieves the chat provider and executes the custom command.
     */
    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        const customPromptActions = ['add', 'get', 'menu']
        if (!customPromptActions.includes(title)) {
            await this.executeRecipe('custom-prompt', title, true)
            return
        }

        const chatProvider = await this.getChatProvider()
        await chatProvider.executeCustomCommand(title, type)
    }

    /**
     * Clears the chat history for the given tree item ID.
     * If no ID is provided, clears all chat history and resets the tree view.
     */
    public async clearHistory(treeItem?: vscode.TreeItem): Promise<void> {
        if (!this.isPanelViewEnabled) {
            await this.sidebarChat.clearHistory()
            return
        }

        const chatID = treeItem?.id
        if (chatID) {
            const provider = await this.getChatProvider()
            await provider?.clearChatHistory(chatID)
            this.disposeProvider(chatID)
        }

        if (!treeItem && this.isPanelViewEnabled) {
            // Show warning to users and get confirmation if they want to clear all history
            const userConfirmation = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all of your chats?',
                { modal: true },
                'Delete All Chats'
            )

            if (!userConfirmation) {
                return
            }

            this.disposePanels()
            await this.sidebarChat.clearHistory()
            this.treeViewProvider.reset()
            return
        }
    }

    /**
     * Clears the current chat session and restarts it, creating a new chat ID.
     */
    public async clearAndRestartSession(): Promise<void> {
        const chatProvider = await this.getChatProvider()
        await chatProvider.clearAndRestartSession()
    }

    /**
     * Restores the webview panel for the given chat ID.
     *
     * If the webview panel does not exist yet, it will be created first.
     * Then reveals the panel and restores the chat session for the given ID.
     */
    private async restorePanel(chatID: string): Promise<void> {
        if (!this.isPanelViewEnabled) {
            await this.sidebarChat.restoreSession(chatID)
            return
        }

        // Panel already exists, just reveal it
        const provider = this.chatPanelProviders.get(chatID)
        if (provider) {
            provider.webviewPanel?.reveal()
            return
        }

        await this.createWebviewPanel(chatID)
    }

    /**
     * Restores a chat session from a given chat ID.
     *
     * Retrieves the chat provider instance, and calls its restoreSession() method
     * to restore the session with the provided chatID.
     */
    public async restoreSession(chatID: string): Promise<void> {
        if (!this.isPanelViewEnabled) {
            await this.sidebarChat.restoreSession(chatID)
            return
        }

        await this.currentProvider.restoreSession(chatID)
    }

    /**
     * Export chat history to file system
     */
    public async exportHistory(): Promise<void> {
        // Use sidebar chat view for non-chat-session specfic actions
        await this.sidebarChat.exportHistory()
    }

    public async simplifiedOnboardingReloadEmbeddingsState(): Promise<void> {
        // All auth-related states are handled by sidebar view
        await this.sidebarChat.simplifiedOnboardingReloadEmbeddingsState()
    }

    public triggerNotice(notice: { key: string }): void {
        if (!this.isPanelViewEnabled) {
            this.sidebarChat.triggerNotice(notice)
            return
        }

        const chatProvider = this.currentProvider || this.sidebarChat
        chatProvider.triggerNotice(notice)
        return
    }

    private disposeProvider(chatID: string): void {
        const provider = this.chatPanelProviders.get(chatID)
        if (!provider) {
            return
        }

        provider.webviewPanel?.dispose()
        provider.dispose()
        this.chatPanelProviders.delete(chatID)
    }

    private disposePanels(): void {
        this.currentProvider = this.sidebarViewProvider
        // Dispose all open panels
        this.chatPanelProviders.forEach(provider => {
            provider.webviewPanel?.dispose()
            provider.dispose()
        })
        this.chatPanelProviders.clear()
    }

    public dispose(): void {
        this.disposePanels()
        this.onConfigurationChange.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

/**
 * Set HTML for webview
 */
export async function addWebviewViewHTML(
    extensionUri: vscode.Uri,
    view: vscode.WebviewView | vscode.WebviewPanel
): Promise<void> {
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

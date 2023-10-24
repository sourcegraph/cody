import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'

import { View } from '../../webviews/NavBar'
import { TreeViewProvider } from '../services/TreeViewProvider'

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

    private messageProviderOptions: MessageProviderOptions
    private extensionUri: vscode.Uri
    private configurationChangeListener: vscode.Disposable

    // Tree view for chat history
    public treeView = new TreeViewProvider('chat')

    protected disposables: vscode.Disposable[] = []

    constructor({ extensionUri, ...options }: ChatViewProviderOptions) {
        this.messageProviderOptions = options
        this.extensionUri = extensionUri
        this.sidebarViewProvider = new ChatViewProvider({ extensionUri, ...options })
        this.currentProvider = this.sidebarViewProvider

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.panel.new', async () => this.createWebviewPanel()),
            vscode.commands.registerCommand('cody.chat.panel.restore', async id => this.restorePanel(id)),
            vscode.commands.registerCommand('cody.chat.history.export', async () => this.exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', async item => this.clearHistory(item)),
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeView)
        )

        // Register config change listener
        this.configurationChangeListener = options.contextProvider.configurationChangeEvent.event(async () => {
            const isChatPanelEnabled = options.contextProvider.config.experimentalChatPanel

            // When chat.chatPanel is set to true, the sidebar chat view will never be shown
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', isChatPanelEnabled)

            if (isChatPanelEnabled) {
                if (!this.chatPanelProviders.size) {
                    await this.createWebviewPanel()
                }
                return
            }

            // when config is disabled, remove all panels
            this.disposePanels()
            this.currentProvider = this.sidebarViewProvider
        })
    }

    public get sidebarChat(): ChatViewProvider {
        return this.sidebarViewProvider
    }

    /**
     * Gets the current chat provider instance for chat-session specific actions.
     *
     * Checks currentProvider first.
     * If not set, defaults to sidebarViewProvider.
     * Sets currentProvider to the returned provider.
     */
    private getChatProvider(): ChatViewProvider | ChatPanelProvider {
        const provider = this.currentProvider || this.sidebarViewProvider
        this.currentProvider = provider
        return provider
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
    public async createWebviewPanel(): Promise<ChatPanelProvider | undefined> {
        if (!this.messageProviderOptions.contextProvider.config.experimentalChatPanel) {
            return undefined
        }

        const options = { treeView: this.treeView, extensionUri: this.extensionUri, ...this.messageProviderOptions }
        const provider = new ChatPanelProvider(options)
        await provider.createWebviewPanel()

        const sessionID = provider.currentChatID

        this.chatPanelProviders.set(sessionID, provider)
        this.currentProvider = provider

        const webviewPanel = provider.webviewPanel

        webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.currentProvider = provider
            }
        })

        webviewPanel?.onDidDispose(() => {
            const provider = this.chatPanelProviders.get(sessionID)
            provider?.dispose()
            this.chatPanelProviders.delete(sessionID)
        })

        await this.clearAndRestartSession()
        return provider
    }

    /**
     * Restores the webview panel for the given chat ID.
     *
     * If the webview panel does not exist yet, it will be created first.
     * Then reveals the panel and restores the chat session for the given ID.
     */
    private async restorePanel(chatID: string): Promise<void> {
        const provider = this.chatPanelProviders.get(chatID)
        if (provider) {
            // Panel already exists, just reveal it
            provider.webviewPanel?.reveal()
            return
        }

        if (chatID !== this.getChatProvider().currentChatID) {
            await this.createWebviewPanel()
            await this.restoreSession(chatID)
        }

        await this.getChatProvider().restoreSession(chatID)
        this.getChatProvider().webviewPanel?.reveal()
    }

    /**
     * Executes a recipe in the chat view.
     * @param recipeId - The ID of the recipe to execute.
     * @param humanChatInput - Optional human chat input to provide to the recipe.
     * @param openChatView - Whether to open the chat view before executing the recipe.
     */
    public async executeRecipe(recipeId: RecipeID, humanChatInput = '', openChatView?: boolean): Promise<void> {
        if (openChatView) {
            // This will create a new panel if experimentalChatPanel is enabled
            await this.setWebviewView('chat')
        }
        // Run command in a new webview to avoid conflicts with context from previous chat
        const chatProvider = this.getChatProvider()
        // All new commands will start in an empty chat session
        await this.clearAndRestartSession()
        await chatProvider.executeRecipe(recipeId, humanChatInput)
    }

    /**
     * Sets the current webview view.
     *
     * If experimental chat panel is enabled, it will create a new webview panel as it only supports chat view.
     * Otherwise it will get the sidebar hat provider and call setWebviewView on it.
     */
    public async setWebviewView(view: View): Promise<void> {
        // Always start command in a new chat session
        const chatProvider = this.getChatProvider()
        await chatProvider.setWebviewView(view)
    }

    /**
     * Executes a custom command action.
     *
     * Checks if the title matches a valid custom command action.
     * If not, opens the chat view.
     * Otherwise retrieves the chat provider and executes the custom command.
     * @param title - The title of the custom command action.
     * @param type - Optional type for the custom command.
     */
    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        const chatProvider = this.getChatProvider()
        const customPromptActions = ['add', 'get', 'menu']
        if (!customPromptActions.includes(title)) {
            await chatProvider.setWebviewView('chat')
            return
        }

        await chatProvider.executeCustomCommand(title, type)
    }

    /**
     * Clears the chat history for the given tree item ID.
     * If no ID is provided, clears all chat history and resets the tree view.
     */
    public async clearHistory(treeItem?: vscode.TreeItem): Promise<void> {
        const chatProvider = this.getChatProvider()
        await chatProvider.clearChatHistory(treeItem?.id)
        if (!treeItem?.id) {
            this.treeView.reset()
        }
    }

    /**
     * Clears the current chat session and restarts it, creating a new chat ID.
     */
    public async clearAndRestartSession(): Promise<void> {
        const chatProvider = this.getChatProvider()
        await chatProvider.clearAndRestartSession()
    }

    /**
     * Restores a chat session from a given chat ID.
     *
     * Retrieves the chat provider instance, and calls its restoreSession() method
     * to restore the session with the provided chatID.
     */
    public async restoreSession(chatID: string): Promise<void> {
        const chatProvider = this.getChatProvider()
        await chatProvider.restoreSession(chatID)
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
        const chatProvider = this.getChatProvider()
        chatProvider.triggerNotice(notice)
        return
    }

    private disposePanels(): void {
        // Dispose all open panels
        this.chatPanelProviders.forEach(provider => {
            provider.webviewPanel?.dispose()
            provider.dispose()
        })
        this.chatPanelProviders.clear()
    }

    public dispose(): void {
        this.disposePanels()
        this.configurationChangeListener.dispose()
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

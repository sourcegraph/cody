import * as vscode from 'vscode'

import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import { featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { View } from '../../../webviews/NavBar'
import { logDebug } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import { AuthStatus } from '../protocol'

import { ChatHistoryManager } from './ChatHistoryManager'
import { CodyChatPanelViewType } from './ChatManager'
import { ChatPanelProvider, ChatPanelProviderOptions, ChatViewProviderWebview } from './ChatPanelProvider'
import { SidebarChatOptions } from './SidebarChatProvider'
import { SimpleChatPanelProvider } from './SimpleChatPanelProvider'

type ChatID = string

export type Config = Pick<ConfigurationWithAccessToken, 'experimentalGuardrails'>

/**
 * An interface to swap out SimpleChatPanelProvider for ChatPanelProvider
 */
export interface IChatPanelProvider extends vscode.Disposable {
    executeRecipe(recipeID: RecipeID, chatID: ChatID, context: any): Promise<void>
    executeCustomCommand(title: string, type?: CustomCommandType): Promise<void>
    clearAndRestartSession(): Promise<void>
    clearChatHistory(chatID: ChatID): Promise<void>
    triggerNotice(notice: { key: string }): void
    webviewPanel?: vscode.WebviewPanel
    webview?: ChatViewProviderWebview
    sessionID: string
    setWebviewView(view: View): Promise<void>
    restoreSession(chatIDj: string): Promise<void>
    setConfiguration?: (config: Config) => void
    handleChatTitle: (title: string) => void
}

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels when experimentalChatPanel is enabled
    private activePanelProvider: IChatPanelProvider | undefined = undefined
    private panelProvidersMap: Map<ChatID, IChatPanelProvider> = new Map()

    private options: ChatPanelProviderOptions
    private onConfigurationChange: vscode.Disposable

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat', featureFlagProvider)
    public treeView

    public supportTreeViewProvider = new TreeViewProvider('support', featureFlagProvider)

    private history = new ChatHistoryManager()

    protected disposables: vscode.Disposable[] = []

    constructor(
        { extensionUri, ...options }: SidebarChatOptions,
        private chatClient: ChatClient,
        private embeddingsSearch: EmbeddingsSearch | null
    ) {
        logDebug('ChatPanelsManager:constructor', 'init')
        this.options = { treeView: this.treeViewProvider, extensionUri, ...options }

        // Create treeview
        this.treeView = vscode.window.createTreeView('cody.chat.tree.view', {
            treeDataProvider: this.treeViewProvider,
        })

        // Register Tree View
        this.disposables.push(
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeViewProvider),
            vscode.window.registerTreeDataProvider('cody.support.tree.view', this.supportTreeViewProvider),
            vscode.window.registerTreeDataProvider(
                'cody.commands.tree.view',
                new TreeViewProvider('command', featureFlagProvider)
            )
        )

        // Register config change listener
        this.onConfigurationChange = options.contextProvider.configurationChangeEvent.event(async () => {
            // When chat.chatPanel is set to true, the sidebar chat view will never be shown
            const isChatPanelEnabled = options.contextProvider.config.experimentalChatPanel
            await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, isChatPanelEnabled)
            // when config is disabled, remove all current panels
            if (!isChatPanelEnabled) {
                this.disposePanels()
                return
            }

            // Remove provider that doesn't have webPanel anymore
            this.panelProvidersMap.forEach((provider, id) => {
                if (!provider.webviewPanel) {
                    provider.dispose()
                    this.panelProvidersMap.delete(id)
                }
                provider.setConfiguration?.(options.contextProvider.config)
            })

            this.useSimpleChatPanelProvider = options.contextProvider.config.experimentalSimpleChatContext
        })

        this.updateTreeViewHistory()
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        this.supportTreeViewProvider.syncAuthStatus(authStatus)
        if (!authStatus.isLoggedIn) {
            this.disposePanels()
        }

        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, authStatus.isLoggedIn)
    }

    public async getChatPanel(): Promise<IChatPanelProvider> {
        const provider = await this.createWebviewPanel()
        // Check if any existing panel is available
        return this.activePanelProvider || provider
    }

    // Sync feature flag for cody.experimental.simpleChatContext to this variable
    private useSimpleChatPanelProvider = false

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(chatID?: string, chatQuestion?: string): Promise<IChatPanelProvider> {
        if (chatID && this.panelProvidersMap.has(chatID)) {
            const provider = this.panelProvidersMap.get(chatID)
            if (provider) {
                provider.webviewPanel?.reveal()
                this.activePanelProvider = provider
                if (chatQuestion) {
                    provider.handleChatTitle(chatQuestion)
                }
                void this.selectTreeItem(chatID)
                return provider
            }
        }

        logDebug('ChatPanelsManager:createWebviewPanel', this.panelProvidersMap.size.toString())

        // Get the view column of the current active chat panel so that we can open a new one on top of it
        const activePanelViewColumn = this.activePanelProvider?.webviewPanel?.viewColumn

        if (this.useSimpleChatPanelProvider) {
            const provider = new SimpleChatPanelProvider({
                ...this.options,
                config: this.options.contextProvider.config,
                chatClient: this.chatClient,
                embeddingsClient: this.embeddingsSearch,
            })
            const webviewPanel = await provider.createWebviewPanel(activePanelViewColumn, chatQuestion)
            if (chatID) {
                await provider.restoreSession(chatID)
            }

            this.activePanelProvider = provider
            this.panelProvidersMap.set(provider.sessionID, provider)

            webviewPanel?.onDidChangeViewState(e => {
                if (e.webviewPanel.visible) {
                    this.activePanelProvider = provider
                    this.options.contextProvider.webview = provider.webview
                    void this.selectTreeItem(provider.sessionID)
                }
            })

            webviewPanel?.onDidDispose(() => {
                this.disposeProvider(sessionID)
            })

            this.selectTreeItem(provider.sessionID)
            return provider
        }

        const provider = new ChatPanelProvider(this.options)
        const webviewPanel = await provider.createWebviewPanel(activePanelViewColumn, chatID, chatQuestion)
        const sessionID = chatID || provider.sessionID
        this.activePanelProvider = provider
        this.panelProvidersMap.set(sessionID, provider)

        webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.activePanelProvider = provider
                this.options.contextProvider.webview = provider.webview
                void this.selectTreeItem(provider.sessionID)
            }
        })

        webviewPanel?.onDidDispose(() => {
            this.disposeProvider(sessionID)
        })

        this.selectTreeItem(sessionID)
        return provider
    }

    public async revive(
        panel: vscode.WebviewPanel,
        sessionID: string,
        chatQuestion?: string
    ): Promise<IChatPanelProvider> {
        logDebug('ChatPanelsManager:revive', sessionID, chatQuestion)

        const provider = this.useSimpleChatPanelProvider
            ? new SimpleChatPanelProvider({
                  ...this.options,
                  config: this.options.contextProvider.config,
                  chatClient: this.chatClient,
                  embeddingsClient: this.embeddingsSearch,
              })
            : new ChatPanelProvider(this.options)

        const webviewPanel = await provider.revive(panel, sessionID)

        if (this.useSimpleChatPanelProvider) {
            await provider.restoreSession(sessionID)
        }

        this.activePanelProvider = provider
        this.panelProvidersMap.set(sessionID, provider)

        webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.activePanelProvider = provider
                this.options.contextProvider.webview = provider.webview
                void this.selectTreeItem(provider.sessionID)
            }
        })

        webviewPanel?.onDidDispose(() => {
            this.disposeProvider(sessionID)
        })

        this.selectTreeItem(sessionID)
        return provider
    }

    private selectTreeItem(chatID: ChatID): void {
        // no op if tree view is not visible
        if (!this.treeView.visible) {
            return
        }

        // Highlights the chat item in tree view
        // This will also open the tree view (sidebar)
        const chat = this.treeViewProvider.getTreeItemByID(chatID)
        if (chat) {
            void this.treeView?.reveal(chat, { select: true, focus: false })
        }
    }

    /**
     * Executes a recipe in the chat view.
     */
    public async executeRecipe(recipeId: RecipeID, humanChatInput: string, source?: ChatEventSource): Promise<void> {
        logDebug('ChatPanelsManager:executeRecipe', recipeId)

        // Run command in a new webview to avoid conflicts with context from exisiting chat
        // Only applies when commands are run outside of chat input box
        const chatProvider = await this.getChatPanel()
        await chatProvider.executeRecipe(recipeId, humanChatInput, source)
    }

    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        logDebug('ChatPanelsManager:executeCustomCommand', title)
        const customPromptActions = ['add', 'get', 'menu']
        if (!customPromptActions.includes(title)) {
            await this.executeRecipe('custom-prompt', title, 'custom-commands')
            return
        }

        const chatProvider = await this.getChatPanel()
        await chatProvider.executeCustomCommand(title, type)
    }

    private updateWebviewPanelTitle(chatID: string, newTitle: string): void {
        const provider = this.panelProvidersMap.get(chatID)
        if (provider?.webviewPanel) {
            provider.webviewPanel.title = newTitle
        }
        return
    }

    private updateTreeViewHistory(): void {
        const localHistory = localStorage.getChatHistory()
        if (localHistory) {
            void this.treeViewProvider.updateTree(
                createCodyChatTreeItems({
                    chat: localHistory?.chat,
                    input: localHistory.input,
                })
            )
        }
    }

    public async handleChatTitle(chatID: string, label: string): Promise<void> {
        await vscode.window
            .showInputBox({
                prompt: 'Enter new chat name',
                value: label,
            })
            .then(async title => {
                const chatHistory = this.history.getChat(chatID)
                if (title && chatHistory) {
                    this.panelProvidersMap.get(chatID)?.handleChatTitle(title)
                    chatHistory.chatTitle = title
                    await this.history.saveChat(chatHistory)
                    this.updateWebviewPanelTitle(chatID, title)
                    this.updateTreeViewHistory()
                }
            })
    }

    public async clearHistory(chatID?: string): Promise<void> {
        if (chatID) {
            this.disposeProvider(chatID)

            await this.activePanelProvider?.clearChatHistory(chatID)
            this.updateTreeViewHistory()
            return
        }

        this.disposePanels()
        this.treeViewProvider.reset()
    }

    public async clearAndRestartSession(): Promise<void> {
        logDebug('ChatPanelsManager', 'clearAndRestartSession')
        // Clear and restart chat session in current panel
        if (this.activePanelProvider) {
            await this.activePanelProvider.clearAndRestartSession()
            return
        }

        // Create and restart in new panel
        const chatProvider = await this.getChatPanel()
        await chatProvider.clearAndRestartSession()
    }

    public async restorePanel(chatID: string, chatQuestion?: string): Promise<void> {
        try {
            logDebug('ChatPanelsManager', 'restorePanel')
            // Panel already exists, just reveal it
            const provider = this.panelProvidersMap.get(chatID)
            if (provider) {
                provider.webviewPanel?.reveal()
                return
            }
            await this.createWebviewPanel(chatID, chatQuestion)
        } catch (error) {
            console.error(error, 'errored restoring panel')
        }
    }

    public triggerNotice(notice: { key: string }): void {
        this.getChatPanel()
            .then(provider => provider.triggerNotice(notice))
            .catch(error => console.error(error))
    }

    private disposeProvider(chatID: string): void {
        if (chatID === this.activePanelProvider?.sessionID) {
            this.activePanelProvider.webviewPanel?.dispose()
            this.activePanelProvider.dispose()
            this.activePanelProvider = undefined
        }

        const provider = this.panelProvidersMap.get(chatID)
        if (provider) {
            this.panelProvidersMap.delete(chatID)
            provider.webviewPanel?.dispose()
            provider.dispose()
        }
    }

    private disposePanels(): void {
        // Dispose all open panels
        this.panelProvidersMap.forEach(provider => {
            provider.webviewPanel?.dispose()
            provider.dispose()
        })
        this.panelProvidersMap.clear()
        this.updateTreeViewHistory()
    }

    public dispose(): void {
        this.disposePanels()
        this.onConfigurationChange.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

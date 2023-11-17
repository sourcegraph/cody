import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { featureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { logDebug } from '../../log'
import { localStorage } from '../../services/LocalStorageProvider'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import { AuthStatus } from '../protocol'

import { ChatPanelProvider, ChatPanelProviderOptions } from './ChatPanelProvider'
import { SidebarChatOptions } from './SidebarChatProvider'

type ChatID = string

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels when experimentalChatPanel is enabled
    private activePanelProvider: ChatPanelProvider | undefined = undefined
    private panelProvidersMap: Map<ChatID, ChatPanelProvider> = new Map()

    private options: ChatPanelProviderOptions
    private onConfigurationChange: vscode.Disposable

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat', featureFlagProvider)
    public treeView

    protected disposables: vscode.Disposable[] = []

    constructor({ extensionUri, ...options }: SidebarChatOptions) {
        logDebug('ChatPanelsManager:constructor', 'init')
        this.options = { treeView: this.treeViewProvider, extensionUri, ...options }

        // Create treeview
        this.treeView = vscode.window.createTreeView('cody.chat.tree.view', {
            treeDataProvider: this.treeViewProvider,
        })

        // Register Tree View
        this.disposables.push(
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeViewProvider),
            vscode.window.registerTreeDataProvider(
                'cody.support.tree.view',
                new TreeViewProvider('support', featureFlagProvider)
            ),
            vscode.window.registerTreeDataProvider(
                'cody.commands.tree.view',
                new TreeViewProvider('command', featureFlagProvider)
            )
        )

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.panel.new', async () => this.createWebviewPanel()),
            vscode.commands.registerCommand('cody.chat.panel.restore', async (id, chat) => this.restorePanel(id, chat))
        )

        // Register config change listener
        this.onConfigurationChange = options.contextProvider.configurationChangeEvent.event(async () => {
            // When chat.chatPanel is set to true, the sidebar chat view will never be shown
            const isChatPanelEnabled = options.contextProvider.config.experimentalChatPanel
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', isChatPanelEnabled)
            // when config is disabled, remove all current panels
            if (!isChatPanelEnabled) {
                this.disposePanels()
                return
            }

            // Remove provider  that doesn't have webPanel anymore
            this.panelProvidersMap.forEach((provider, id) => {
                if (!provider.webviewPanel) {
                    provider.dispose()
                    this.panelProvidersMap.delete(id)
                }
            })
        })

        this.updateTreeViewHistory()
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        this.treeViewProvider.syncAuthStatus(authStatus)
        if (!authStatus.isLoggedIn) {
            this.disposePanels()
        }

        await vscode.commands.executeCommand('setContext', 'cody.chatPanel', authStatus.isLoggedIn)
    }

    public async getChatPanel(): Promise<ChatPanelProvider> {
        const provider = await this.createWebviewPanel()
        // Check if any existing panel is available
        return this.activePanelProvider || provider
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(chatID?: string, chatQuestion?: string): Promise<ChatPanelProvider> {
        logDebug('ChatPanelsManager:createWebviewPanel', this.panelProvidersMap.size.toString())
        const provider = new ChatPanelProvider(this.options)
        const webviewPanel = await provider.createWebviewPanel(chatID, chatQuestion)
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
        logDebug('ChatPanelsManager', 'restorePanel')
        // Panel already exists, just reveal it
        const provider = this.panelProvidersMap.get(chatID)
        if (provider) {
            provider.webviewPanel?.reveal()
            return
        }

        await this.createWebviewPanel(chatID, chatQuestion)
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

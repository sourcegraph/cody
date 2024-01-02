import * as vscode from 'vscode'

import { ChatModelProvider } from '@sourcegraph/cody-shared'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared/src/configuration'
import {
    FeatureFlagProvider,
    featureFlagProvider,
} from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'

import { View } from '../../../webviews/NavBar'
import { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'
import { MessageProviderOptions } from '../MessageProvider'
import { AuthStatus, ExtensionMessage } from '../protocol'

import { chatHistory } from './ChatHistoryManager'
import { CodyChatPanelViewType } from './ChatManager'
import { SidebarViewOptions } from './SidebarViewController'
import { SimpleChatPanelProvider } from './SimpleChatPanelProvider'
import { SimpleChatRecipeAdapter } from './SimpleChatRecipeAdapter'

type ChatID = string

export type Config = Pick<ConfigurationWithAccessToken, 'experimentalGuardrails' | 'experimentalSymfContext'>

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
}

/**
 * An interface to swap out SimpleChatPanelProvider for ChatPanelProvider
 */
export interface IChatPanelProvider extends vscode.Disposable {
    executeRecipe(recipeID: RecipeID, chatID: ChatID, context: any): Promise<void>
    executeCustomCommand(title: string, type?: CustomCommandType): Promise<void>
    clearAndRestartSession(): Promise<void>
    handleChatTitle(title: string): void
    triggerNotice(notice: { key: string }): void
    webviewPanel?: vscode.WebviewPanel
    webview?: ChatViewProviderWebview
    sessionID: string
    setWebviewView(view: View): Promise<void>
    restoreSession(chatID: string): Promise<void>
    setConfiguration?: (config: Config) => void
    revive: (panel: vscode.WebviewPanel, chatID: string) => Promise<void>
}

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels
    private activePanelProvider: IChatPanelProvider | undefined = undefined
    private panelProvidersMap: Map<ChatID, IChatPanelProvider> = new Map()

    private options: ChatPanelProviderOptions

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat', featureFlagProvider)
    public treeView

    public supportTreeViewProvider = new TreeViewProvider('support', featureFlagProvider)

    // We keep track of the currently authenticated account and dispose open chats when it changes
    private currentAuthAccount: undefined | { endpoint: string; primaryEmail: string }

    protected disposables: vscode.Disposable[] = []

    constructor(
        { extensionUri, ...options }: SidebarViewOptions,
        private chatClient: ChatClient,
        private readonly embeddingsClient: CachedRemoteEmbeddingsClient,
        private readonly localEmbeddings: LocalEmbeddingsController | null,
        private readonly symf: SymfRunner | null
    ) {
        logDebug('ChatPanelsManager:constructor', 'init')
        this.options = { treeView: this.treeViewProvider, extensionUri, featureFlagProvider, ...options }

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
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        this.supportTreeViewProvider.syncAuthStatus(authStatus)
        if (!authStatus.isLoggedIn) {
            this.disposePanels()
        } else if (
            this.currentAuthAccount &&
            (this.currentAuthAccount.endpoint !== authStatus.endpoint ||
                this.currentAuthAccount.primaryEmail !== authStatus.primaryEmail)
        ) {
            this.disposePanels()
        }

        this.currentAuthAccount = {
            endpoint: authStatus.endpoint ?? '',
            primaryEmail: authStatus.primaryEmail,
        }

        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, authStatus.isLoggedIn)
        await this.updateTreeViewHistory()
    }

    public async getChatPanel(): Promise<IChatPanelProvider> {
        const provider = await this.createWebviewPanel()
        // Check if any existing panel is available
        return this.activePanelProvider || provider
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(
        chatID?: string,
        chatQuestion?: string,
        panel?: vscode.WebviewPanel
    ): Promise<IChatPanelProvider> {
        if (chatID && this.panelProvidersMap.has(chatID)) {
            const provider = this.panelProvidersMap.get(chatID)
            if (provider?.webviewPanel) {
                provider.webviewPanel?.reveal()
                this.activePanelProvider = provider
                void this.selectTreeItem(chatID)
                return provider
            }
        }

        // Reuse existing "New Chat" panel if there is an empty one
        const emptyNewChatProvider = Array.from(this.panelProvidersMap.values()).find(
            p => p.webviewPanel?.title === 'New Chat'
        )
        if (!chatID && !panel && this.panelProvidersMap.size && emptyNewChatProvider) {
            emptyNewChatProvider.webviewPanel?.reveal()
            this.activePanelProvider = emptyNewChatProvider
            this.options.contextProvider.webview = emptyNewChatProvider.webview
            void this.selectTreeItem(emptyNewChatProvider.sessionID)
            return emptyNewChatProvider
        }

        logDebug('ChatPanelsManager:createWebviewPanel', this.panelProvidersMap.size.toString())

        // Get the view column of the current active chat panel so that we can open a new one on top of it
        const activePanelViewColumn = this.activePanelProvider?.webviewPanel?.viewColumn

        const provider = this.createProvider()
        if (chatID) {
            await provider.restoreSession(chatID)
        }
        // Revives a chat panel provider for a given webview panel and session ID.
        // Restores any existing session data. Registers handlers for view state changes and dispose events.
        if (panel) {
            await provider.revive(panel)
        } else {
            await provider.createWebviewPanel(activePanelViewColumn, chatID, chatQuestion)
        }
        const sessionID = chatID || provider.sessionID

        provider.webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.activePanelProvider = provider
                this.options.contextProvider.webview = provider.webview
                void this.selectTreeItem(provider.sessionID)
            }
        })

        provider.webviewPanel?.onDidDispose(() => {
            this.disposeProvider(sessionID)
        })

        this.activePanelProvider = provider
        this.panelProvidersMap.set(sessionID, provider)

        // Selects the corresponding tree view item.
        this.selectTreeItem(sessionID)

        return provider
    }

    /**
     * Creates a provider for the chat panel.
     */
    private createProvider(): SimpleChatPanelProvider {
        const authProvider = this.options.authProvider
        const authStatus = authProvider.getAuthStatus()
        if (authStatus?.configOverwrites?.chatModel) {
            ChatModelProvider.add(new ChatModelProvider(authStatus.configOverwrites.chatModel))
        }
        const models = ChatModelProvider.get(authStatus.endpoint)

        return new SimpleChatPanelProvider({
            ...this.options,
            config: this.options.contextProvider.config,
            chatClient: this.chatClient,
            embeddingsClient: this.embeddingsClient,
            localEmbeddings: this.localEmbeddings,
            symf: this.symf,
            recipeAdapter: new SimpleChatRecipeAdapter(
                this.options.editor,
                this.options.intentDetector,
                this.options.contextProvider,
                this.options.platform
            ),
            models,
        })
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

    private async updateTreeViewHistory(): Promise<void> {
        await this.treeViewProvider.updateTree(createCodyChatTreeItems(this.options.authProvider.getAuthStatus()))
    }

    public async editChatHistory(chatID: string, label: string): Promise<void> {
        await vscode.window
            .showInputBox({
                prompt: 'Enter new chat name',
                value: label,
            })
            .then(async title => {
                const authProvider = this.options.authProvider
                const authStatus = authProvider.getAuthStatus()

                const history = chatHistory.getChat(authStatus, chatID)
                if (title && history) {
                    history.chatTitle = title
                    await chatHistory.saveChat(authStatus, history)
                    await this.updateTreeViewHistory()
                    const chatIDUTC = new Date(chatID).toUTCString()
                    const provider = this.panelProvidersMap.get(chatID) || this.panelProvidersMap.get(chatIDUTC)
                    provider?.handleChatTitle(title)
                }
            })
    }

    public async clearHistory(chatID?: string): Promise<void> {
        const authProvider = this.options.authProvider
        const authStatus = authProvider.getAuthStatus()
        // delete single chat
        if (chatID) {
            await chatHistory.deleteChat(authStatus, chatID)
            this.disposeProvider(chatID)
            await this.updateTreeViewHistory()
            return
        }
        // delete all chats
        await chatHistory.clear(authStatus)
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

    public async triggerNotice(notice: { key: string }): Promise<void> {
        const chatProvider = await this.getChatPanel()
        chatProvider.triggerNotice(notice)
    }

    private disposeProvider(chatID: string): void {
        if (chatID === this.activePanelProvider?.sessionID) {
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
        void this.updateTreeViewHistory()
    }

    public dispose(): void {
        this.disposePanels()
        this.disposables.forEach(d => d.dispose())
    }
}

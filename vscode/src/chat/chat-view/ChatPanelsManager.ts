import * as vscode from 'vscode'

import {
    type ChatClient,
    type Configuration,
    type ConfigurationWithAccessToken,
    type FeatureFlagProvider,
    type Guardrails,
    ModelProvider,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'

import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { TreeViewProvider } from '../../services/tree-views/TreeViewProvider'
import type { MessageProviderOptions } from '../MessageProvider'
import type { AuthStatus, ExtensionMessage } from '../protocol'

import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import type { ContextRankingController } from '../../local-context/context-ranking'
import { chatHistory } from './ChatHistoryManager'
import { CodyChatPanelViewType } from './ChatManager'
import type { SidebarViewOptions } from './SidebarViewController'
import { SimpleChatPanelProvider } from './SimpleChatPanelProvider'

type ChatID = string

export type ChatPanelConfig = Pick<
    ConfigurationWithAccessToken,
    | 'experimentalGuardrails'
    | 'experimentalSymfContext'
    | 'internalUnstable'
    | 'useContext'
    | 'experimentalChatContextRanker'
>

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
    config: Pick<Configuration, 'isRunningInsideAgent'>
}

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels
    private activePanelProvider: SimpleChatPanelProvider | undefined = undefined
    private panelProviders: SimpleChatPanelProvider[] = []

    private options: ChatPanelProviderOptions

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat', featureFlagProvider)
    public treeView

    public supportTreeViewProvider = new TreeViewProvider('support', featureFlagProvider)

    // We keep track of the currently authenticated account and dispose open chats when it changes
    private currentAuthAccount: undefined | { endpoint: string; primaryEmail: string; username: string }

    protected disposables: vscode.Disposable[] = []

    constructor(
        { extensionUri, ...options }: SidebarViewOptions,
        private chatClient: ChatClient,
        private readonly localEmbeddings: LocalEmbeddingsController | null,
        private readonly contextRanking: ContextRankingController | null,
        private readonly symf: SymfRunner | null,
        private readonly enterpriseContext: EnterpriseContextFactory | null,
        private readonly guardrails: Guardrails
    ) {
        logDebug('ChatPanelsManager:constructor', 'init')
        this.options = {
            treeView: this.treeViewProvider,
            extensionUri,
            featureFlagProvider,
            ...options,
        }

        // Create treeview
        this.treeView = vscode.window.createTreeView('cody.chat.tree.view', {
            treeDataProvider: this.treeViewProvider,
        })
        this.disposables.push(this.treeViewProvider)
        this.disposables.push(this.treeView)

        // Register Tree View
        this.disposables.push(
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeViewProvider),
            vscode.window.registerTreeDataProvider(
                'cody.support.tree.view',
                this.supportTreeViewProvider
            )
        )
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        const hasLoggedOut = !authStatus.isLoggedIn
        const hasSwitchedAccount =
            this.currentAuthAccount && this.currentAuthAccount.endpoint !== authStatus.endpoint
        if (hasLoggedOut || hasSwitchedAccount) {
            this.disposePanels()
        }

        this.currentAuthAccount = {
            endpoint: authStatus.endpoint ?? '',
            primaryEmail: authStatus.primaryEmail,
            username: authStatus.username,
        }

        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, authStatus.isLoggedIn)
        await this.updateTreeViewHistory()
        this.supportTreeViewProvider.syncAuthStatus(authStatus)
    }

    public async getChatPanel(): Promise<SimpleChatPanelProvider> {
        const provider = await this.createWebviewPanel()

        if (this.options.config.isRunningInsideAgent) {
            // Never reuse webviews when running inside the agent.
            return provider
        }

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
    ): Promise<SimpleChatPanelProvider> {
        if (chatID && this.panelProviders.map(p => p.sessionID).includes(chatID)) {
            const provider = this.panelProviders.find(p => p.sessionID === chatID)
            if (provider?.webviewPanel) {
                provider.webviewPanel?.reveal()
                this.activePanelProvider = provider
                void this.selectTreeItem(chatID)
                return provider
            }
        }

        // Reuse existing "New Chat" panel if there is an empty one
        const emptyNewChatProvider = this.panelProviders.find(p => p.webviewPanel?.title === 'New Chat')
        if (
            !this.options.config.isRunningInsideAgent && // Don't reuse panels in the agent
            !chatID &&
            !panel &&
            this.panelProviders.length &&
            emptyNewChatProvider
        ) {
            emptyNewChatProvider.webviewPanel?.reveal()
            this.activePanelProvider = emptyNewChatProvider
            this.options.contextProvider.webview = emptyNewChatProvider.webview
            void this.selectTreeItem(emptyNewChatProvider.sessionID)
            return emptyNewChatProvider
        }

        logDebug('ChatPanelsManager:createWebviewPanel', this.panelProviders.length.toString())

        // Get the view column of the current active chat panel so that we can open a new one on top of it
        const activePanelViewColumn = this.activePanelProvider?.webviewPanel?.viewColumn

        const provider = this.createProvider()
        if (chatID) {
            await provider.restoreSession(chatID)
        } else {
            await provider.newSession()
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
        this.panelProviders.push(provider)

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
            ModelProvider.add(
                new ModelProvider(authStatus.configOverwrites.chatModel, [
                    ModelUsage.Chat,
                    // TODO: Add configOverwrites.editModel for separate edit support
                    ModelUsage.Edit,
                ])
            )
        }
        const models = ModelProvider.get(ModelUsage.Chat, authStatus.endpoint)
        const isConsumer = authProvider.getAuthStatus().isDotCom

        return new SimpleChatPanelProvider({
            ...this.options,
            config: this.options.contextProvider.config,
            chatClient: this.chatClient,
            localEmbeddings: isConsumer ? this.localEmbeddings : null,
            contextRanking: isConsumer ? this.contextRanking : null,
            symf: isConsumer ? this.symf : null,
            enterpriseContext: isConsumer ? null : this.enterpriseContext,
            models,
            guardrails: this.guardrails,
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

    private async updateTreeViewHistory(): Promise<void> {
        await this.treeViewProvider.updateTree(this.options.authProvider.getAuthStatus())
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
                    const provider =
                        this.panelProviders.find(p => p.sessionID === chatID) ||
                        this.panelProviders.find(p => p.sessionID === chatIDUTC)
                    provider?.setChatTitle(title)
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

    /**
     * Clear the current chat view and start a new chat session in the active panel
     */
    public async resetPanel(): Promise<void> {
        logDebug('ChatPanelsManager', 'resetPanel')
        telemetryService.log(
            'CodyVSCodeExtension:chatTitleButton:clicked',
            { name: 'clear' },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent('cody.interactive.clear', 'clicked', {
            privateMetadata: { name: 'clear' },
        })
        if (this.activePanelProvider) {
            return this.activePanelProvider.clearAndRestartSession()
        }
    }

    public async restorePanel(
        chatID: string,
        chatQuestion?: string
    ): Promise<SimpleChatPanelProvider | undefined> {
        try {
            logDebug('ChatPanelsManager', 'restorePanel')
            // Panel already exists, just reveal it
            const provider = this.panelProviders.find(p => p.sessionID === chatID)
            if (provider?.sessionID === chatID) {
                provider.webviewPanel?.reveal()
                return provider
            }
            return await this.createWebviewPanel(chatID, chatQuestion)
        } catch (error) {
            console.error(error, 'errored restoring panel')
            return undefined
        }
    }

    private disposeProvider(chatID: string): void {
        if (chatID === this.activePanelProvider?.sessionID) {
            this.activePanelProvider = undefined
        }

        const providerIndex = this.panelProviders.findIndex(p => p.sessionID === chatID)
        if (providerIndex !== -1) {
            const removedProvider = this.panelProviders.splice(providerIndex, 1)[0]
            removedProvider.webviewPanel?.dispose()
            removedProvider.dispose()
        }
    }

    // Dispose all open panels
    private disposePanels(): void {
        // dispose activePanelProvider if exists
        const activePanelID = this.activePanelProvider?.sessionID
        if (activePanelID) {
            this.disposeProvider(activePanelID)
        }
        // loop through the panel provider map
        const oldPanelProviders = this.panelProviders
        this.panelProviders = []
        for (const provider of oldPanelProviders) {
            provider.webviewPanel?.dispose()
            provider.dispose()
        }
        void this.updateTreeViewHistory()
    }

    public dispose(): void {
        this.disposePanels()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

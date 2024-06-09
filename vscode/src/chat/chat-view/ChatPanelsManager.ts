import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    type ConfigurationWithAccessToken,
    type FeatureFlagProvider,
    type Guardrails,
    ModelUsage,
    ModelsService,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
// biome-ignore lint/nursery/noRestrictedImports: Deprecated v1 telemetry used temporarily to support existing analytics.
import { telemetryService } from '../../services/telemetry'
import { TreeViewProvider } from '../../services/tree-views/TreeViewProvider'
import type { MessageProviderOptions } from '../MessageProvider'
import type { ExtensionMessage } from '../protocol'

import { getConfiguration } from '../../configuration'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import type { ContextRankingController } from '../../local-context/context-ranking'
import { chatHistory } from './ChatHistoryManager'
import { CodyChatPanelViewType } from './ChatManager'
import type { SidebarViewOptions } from './SidebarViewController'
import {
    SimpleChatPanelProvider,
    disposeWebviewViewOrPanel,
    revealWebviewViewOrPanel,
    webviewViewOrPanelOnDidChangeViewState,
    webviewViewOrPanelViewColumn,
} from './SimpleChatPanelProvider'

type ChatID = string

export type ChatPanelConfig = Pick<
    ConfigurationWithAccessToken,
    'internalUnstable' | 'useContext' | 'experimentalChatContextRanker'
>

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    featureFlagProvider: FeatureFlagProvider
}

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels
    private activePanelProvider: SimpleChatPanelProvider | undefined = undefined
    private panelProviders: SimpleChatPanelProvider[] = []

    private options: ChatPanelProviderOptions & SidebarViewOptions

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat', featureFlagProvider)
    public treeView: vscode.TreeView<vscode.TreeItem>

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

        const endpoint = authStatus.endpoint ?? ''
        this.currentAuthAccount = {
            endpoint,
            primaryEmail: authStatus.primaryEmail,
            username: authStatus.username,
        }

        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, authStatus.isLoggedIn)
        await this.updateTreeViewHistory()
        this.supportTreeViewProvider.syncAuthStatus(authStatus)
    }

    public async getNewChatPanel(): Promise<SimpleChatPanelProvider> {
        const provider = await this.createWebviewPanel()
        return provider
    }

    /**
     * Gets the currently active chat panel provider.
     *
     * If an active panel provider already exists and the application is not running inside an agent, it returns the existing provider.
     * Otherwise, it creates a new webview panel and returns the new provider.
     *
     * @returns {Promise<SimpleChatPanelProvider>} The active chat panel provider.
     */
    public async getActiveChatPanel(): Promise<SimpleChatPanelProvider> {
        // Check if any existing panel is available
        // NOTE: Never reuse webviews when running inside the agent.
        if (this.activePanelProvider && !getConfiguration().isRunningInsideAgent) {
            return this.activePanelProvider
        }

        const provider = await this.createWebviewPanel()
        return provider
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
            if (provider?.webviewPanelOrView) {
                revealWebviewViewOrPanel(provider.webviewPanelOrView)
                this.activePanelProvider = provider
                void this.selectTreeItem(chatID)
                return provider
            }
        }

        // Get the view column of the current active chat panel so that we can open a new one on top of it
        const activePanelViewColumn = this.activePanelProvider?.webviewPanelOrView
            ? webviewViewOrPanelViewColumn(this.activePanelProvider?.webviewPanelOrView)
            : undefined

        const provider = this.createProvider()
        if (chatID) {
            await provider.restoreSession(chatID)
        } else {
            await provider.newSession()
        }
        // Revives a chat panel provider for a given webview panel and session ID.
        // Restores any existing session data. Registers handlers for view state changes and dispose events.
        if (panel) {
            this.activePanelProvider = provider
            await provider.revive(panel)
        } else {
            await provider.createWebviewViewOrPanel(activePanelViewColumn, chatID, chatQuestion)
        }
        const sessionID = chatID || provider.sessionID

        if (provider.webviewPanelOrView) {
            webviewViewOrPanelOnDidChangeViewState(provider.webviewPanelOrView)(e => {
                if (e.webviewPanel.visible && e.webviewPanel.active) {
                    this.activePanelProvider = provider
                    void this.selectTreeItem(provider.sessionID)
                }
            })
        }

        provider.webviewPanelOrView?.onDidDispose(() => {
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

        const isConsumer = authStatus.isDotCom
        const isCodyProUser = !authStatus.userCanUpgrade
        const models = ModelsService.getModels(ModelUsage.Chat, isCodyProUser)

        return new SimpleChatPanelProvider({
            ...this.options,
            chatClient: this.chatClient,
            localEmbeddings: isConsumer ? this.localEmbeddings : null,
            contextRanking: isConsumer ? this.contextRanking : null,
            symf: isConsumer ? this.symf : null,
            enterpriseContext: isConsumer ? null : this.enterpriseContext,
            models,
            guardrails: this.guardrails,
            startTokenReceiver: this.options.startTokenReceiver,
        })
    }

    private updateChatPanelContext(): void {
        const hasChatPanels = this.panelProviders.length > 0
        vscode.commands.executeCommand('setContext', 'cody.hasChatPanelsOpened', hasChatPanels)
    }

    private selectTreeItem(chatID: ChatID): void {
        this.updateChatPanelContext()
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
        this.updateChatPanelContext()
        await this.treeViewProvider.updateTree(this.options.authProvider.getAuthStatus())
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
                if (provider.webviewPanelOrView) {
                    revealWebviewViewOrPanel(provider.webviewPanelOrView)
                }
                this.activePanelProvider = provider
                return provider
            }
            this.activePanelProvider = await this.createWebviewPanel(chatID, chatQuestion)
            return this.activePanelProvider
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
            if (removedProvider.webviewPanelOrView) {
                disposeWebviewViewOrPanel(removedProvider.webviewPanelOrView)
            }
            removedProvider.dispose()
        }

        this.updateChatPanelContext()
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
            if (provider.webviewPanelOrView) {
                disposeWebviewViewOrPanel(provider.webviewPanelOrView)
            }
            provider.dispose()
        }
        void this.updateTreeViewHistory()
    }

    public dispose(): void {
        this.disposePanels()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

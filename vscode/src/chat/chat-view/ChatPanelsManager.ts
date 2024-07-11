import * as vscode from 'vscode'

import {
    type AuthStatus,
    type ChatClient,
    CodyIDE,
    type ConfigurationWithAccessToken,
    type FeatureFlagProvider,
    type Guardrails,
    ModelUsage,
    ModelsService,
    featureFlagProvider,
} from '@sourcegraph/cody-shared'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import { TreeViewProvider } from '../../services/tree-views/TreeViewProvider'
import type { MessageProviderOptions } from '../MessageProvider'
import type { ExtensionMessage } from '../protocol'

import type { startTokenReceiver } from '../../auth/token-receiver'
import { getConfiguration } from '../../configuration'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import type { ContextRankingController } from '../../local-context/context-ranking'
import type { ContextAPIClient } from '../context/contextAPIClient'
import {
    ChatController,
    disposeWebviewViewOrPanel,
    revealWebviewViewOrPanel,
    webviewViewOrPanelOnDidChangeViewState,
    webviewViewOrPanelViewColumn,
} from './ChatController'
import { chatHistory } from './ChatHistoryManager'
import { CodyChatPanelViewType } from './ChatManager'

export type ChatPanelConfig = Pick<
    ConfigurationWithAccessToken,
    'internalUnstable' | 'useContext' | 'experimentalChatContextRanker'
>

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface SidebarViewOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    startTokenReceiver?: typeof startTokenReceiver
}

interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    featureFlagProvider: FeatureFlagProvider
}

export class ChatPanelsManager implements vscode.Disposable {
    // Chat views in editor panels
    private activePanelProvider: ChatController | undefined = undefined
    private panelProviders: ChatController[] = []
    private sidebarProvider: ChatController

    private options: ChatPanelProviderOptions & SidebarViewOptions

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
        private readonly enterpriseContext: EnterpriseContextFactory,
        private readonly guardrails: Guardrails,
        private readonly contextAPIClient: ContextAPIClient | null
    ) {
        logDebug('ChatPanelsManager:constructor', 'init')
        this.options = {
            extensionUri,
            featureFlagProvider,
            ...options,
        }

        // Register Tree View
        this.disposables.push(
            vscode.window.registerTreeDataProvider(
                'cody.support.tree.view',
                this.supportTreeViewProvider
            )
        )

        this.sidebarProvider = this.createProvider()
        this.disposables.push(
            vscode.window.registerWebviewViewProvider('cody.chat', this.sidebarProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            })
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
        this.supportTreeViewProvider.syncAuthStatus(authStatus)

        this.sidebarProvider.syncAuthStatus()
    }

    public async getNewChatPanel(): Promise<ChatController> {
        const provider = await this.createWebviewPanel()
        return provider
    }

    /**
     * Gets the currently active chat panel provider.
     *
     * If editor panels exist, prefer those. Otherwise, return the sidebar provider.
     *
     * @returns {Promise<ChatController>} The active chat panel provider.
     */
    public async getActiveChatPanel(): Promise<ChatController> {
        // Check if any existing panel is available
        // NOTE: Never reuse webviews when running inside the agent.
        if (this.activePanelProvider) {
            if (getConfiguration().isRunningInsideAgent) {
                return await this.createWebviewPanel()
            }
            return this.activePanelProvider
        }
        return this.sidebarProvider
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(
        chatID?: string,
        chatQuestion?: string,
        panel?: vscode.WebviewPanel
    ): Promise<ChatController> {
        if (chatID && this.panelProviders.map(p => p.sessionID).includes(chatID)) {
            const provider = this.panelProviders.find(p => p.sessionID === chatID)
            if (provider?.webviewPanelOrView) {
                revealWebviewViewOrPanel(provider.webviewPanelOrView)
                this.activePanelProvider = provider
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
                }
            })
        }

        provider.webviewPanelOrView?.onDidDispose(() => {
            this.disposeProvider(sessionID)
        })

        this.activePanelProvider = provider
        this.panelProviders.push(provider)

        return provider
    }

    /**
     * Creates a provider for a chat view.
     */
    private createProvider(): ChatController {
        const authStatus = this.options.authProvider.getAuthStatus()
        const isConsumer = authStatus.isDotCom
        const isCodyProUser = !authStatus.userCanUpgrade
        const models = ModelsService.getModels(ModelUsage.Chat, isCodyProUser)

        // Enterprise context is used for remote repositories context fetching
        // in vs cody extension it should be always off if extension is connected
        // to dot com instance, but in Cody Web it should be on by default for
        // all instances (including dot com)
        const isCodyWeb =
            vscode.workspace.getConfiguration().get<string>('cody.advanced.agent.ide') === CodyIDE.Web
        const allowRemoteContext = isCodyWeb || !isConsumer

        return new ChatController({
            ...this.options,
            chatClient: this.chatClient,
            localEmbeddings: isConsumer ? this.localEmbeddings : null,
            contextRanking: isConsumer ? this.contextRanking : null,
            symf: isConsumer ? this.symf : null,
            enterpriseContext: allowRemoteContext ? this.enterpriseContext : null,
            models,
            guardrails: this.guardrails,
            startTokenReceiver: this.options.startTokenReceiver,
            contextAPIClient: this.contextAPIClient,
        })
    }

    public async clearHistory(chatID?: string): Promise<void> {
        const authProvider = this.options.authProvider
        const authStatus = authProvider.getAuthStatus()
        // delete single chat
        if (chatID) {
            await chatHistory.deleteChat(authStatus, chatID)
            this.disposeProvider(chatID)
            return
        }
        // delete all chats
        await chatHistory.clear(authStatus)
        this.disposePanels()
    }

    public async resetSidebar(): Promise<void> {
        this.sidebarProvider.clearAndRestartSession()
    }

    public async moveChatToEditor(): Promise<void> {
        const sessionID = this.sidebarProvider.sessionID
        await Promise.all([this.createWebviewPanel(sessionID), this.resetSidebar()])
    }

    public async moveChatFromEditor(): Promise<void> {
        const sessionID = this.activePanelProvider?.sessionID
        if (!sessionID) {
            return
        }
        await Promise.all([
            this.sidebarProvider.restoreSession(sessionID),
            vscode.commands.executeCommand('workbench.action.closeActiveEditor'),
        ])
        await vscode.commands.executeCommand('cody.chat.focus')
    }

    public async restorePanel(
        chatID: string,
        chatQuestion?: string
    ): Promise<ChatController | undefined> {
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
    }

    public dispose(): void {
        this.disposePanels()
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

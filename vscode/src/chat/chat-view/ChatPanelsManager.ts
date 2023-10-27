import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../../webviews/NavBar'
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

    private isPanelViewEnabled = false

    private options: ChatPanelProviderOptions
    private onConfigurationChange: vscode.Disposable

    // Tree view for chat history
    public treeViewProvider = new TreeViewProvider('chat')
    public treeView

    protected disposables: vscode.Disposable[] = []

    constructor({ extensionUri, ...options }: SidebarChatOptions) {
        this.isPanelViewEnabled = options.contextProvider.config.experimentalChatPanel

        this.treeView = vscode.window.createTreeView('cody.chat.tree.view', {
            treeDataProvider: this.treeViewProvider,
        })

        this.options = { treeView: this.treeViewProvider, extensionUri, ...options }

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.panel.new', async () => this.createWebviewPanel()),
            vscode.commands.registerCommand('cody.chat.panel.restore', async (id, chat) => this.restorePanel(id, chat)),
            vscode.window.registerTreeDataProvider('cody.chat.tree.view', this.treeViewProvider),
            vscode.window.registerTreeDataProvider('cody.support.tree.view', new TreeViewProvider('support')),
            vscode.window.registerTreeDataProvider('cody.commands.tree.view', new TreeViewProvider('command'))
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
            this.panelProvidersMap.forEach((provider, id) => {
                if (!provider.webviewPanel) {
                    provider.dispose()
                    this.panelProvidersMap.delete(id)
                }
            })
        })
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        if (!authStatus.isLoggedIn) {
            this.disposePanels()
        }

        await vscode.commands.executeCommand('setContext', 'cody.chatPanel', authStatus.isLoggedIn)
    }

    public async getChatProvider(): Promise<ChatPanelProvider> {
        // Check if any existing panel is available
        if (!this.activePanelProvider?.webviewPanel) {
            this.activePanelProvider?.dispose()
            this.activePanelProvider = undefined
        }
        if (this.activePanelProvider) {
            return this.activePanelProvider
        }
        return this.createWebviewPanel()
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(chatID?: string, chatQuestion?: string): Promise<ChatPanelProvider> {
        const provider = new ChatPanelProvider(this.options)
        const webviewPanel = await provider.createWebviewPanel(chatID, chatQuestion)

        const sessionID = chatID || provider.currentChatID
        this.activePanelProvider = provider
        this.panelProvidersMap.set(sessionID, provider)

        webviewPanel?.onDidChangeViewState(e => {
            if (e.webviewPanel.visible && e.webviewPanel.active) {
                this.activePanelProvider = provider
                this.options.contextProvider.webview = provider.webview
                const chat = this.treeViewProvider.getTreeItemByID(provider.currentChatID)
                if (chat) {
                    void this.treeView?.reveal(chat, { select: true })
                }
            }
        })

        webviewPanel?.onDidDispose(() => {
            const provider = this.panelProvidersMap.get(sessionID)
            provider?.dispose()
            this.panelProvidersMap.delete(sessionID)
        })

        return provider
    }

    public async setWebviewView(view: View): Promise<void> {
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

        // Run command in a new webview to avoid conflicts with context from exisiting chat
        // Only applies when commands are run outside of chat input box
        const chatProvider = await this.getChatProvider()
        await chatProvider.executeRecipe(recipeId, humanChatInput, source)
    }

    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        const customPromptActions = ['add', 'get', 'menu']
        if (!customPromptActions.includes(title)) {
            await this.executeRecipe('custom-prompt', title, true)
            return
        }

        const chatProvider = await this.getChatProvider()
        await chatProvider.executeCustomCommand(title, type)
    }

    public clearHistory(chatID?: string): void {
        if (chatID) {
            this.disposeProvider(chatID)
            return
        }

        this.disposePanels()
        this.treeViewProvider.reset()
    }

    public async clearAndRestartSession(): Promise<void> {
        const chatProvider = await this.getChatProvider()
        await chatProvider.clearAndRestartSession()
    }

    private async restorePanel(chatID: string, chatQuestion?: string): Promise<void> {
        // Panel already exists, just reveal it
        const provider = this.panelProvidersMap.get(chatID)
        if (provider) {
            provider.webviewPanel?.reveal()
            return
        }

        await this.createWebviewPanel(chatID, chatQuestion)
    }

    public triggerNotice(notice: { key: string }): void {
        this.getChatProvider()
            .then(provider => provider.triggerNotice(notice))
            .catch(error => console.error(error))
    }

    private disposeProvider(chatID: string): void {
        const provider = this.panelProvidersMap.get(chatID)
        if (provider) {
            provider.webviewPanel?.dispose()
            provider.dispose()
            this.panelProvidersMap.delete(chatID)
        }
    }

    private disposePanels(): void {
        // Dispose all open panels
        this.panelProvidersMap.forEach(provider => {
            provider.webviewPanel?.dispose()
            provider.dispose()
        })
        this.panelProvidersMap.clear()
    }

    public dispose(): void {
        this.disposePanels()
        this.onConfigurationChange.dispose()
        this.disposables.forEach(d => d.dispose())
    }
}

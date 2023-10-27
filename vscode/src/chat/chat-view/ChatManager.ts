import * as vscode from 'vscode'

import { CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { View } from '../../../webviews/NavBar'
import { telemetryService } from '../../services/telemetry'
import { AuthStatus } from '../protocol'

import { ChatPanelProvider } from './ChatPanelProvider'
import { ChatPanelsManager } from './ChatPanelsManager'
import { SidebarChatOptions, SidebarChatProvider } from './SidebarChatProvider'

/**
 * Manages chat view providers and panels.
 */
export class ChatManager implements vscode.Disposable {
    // View in sidebar for auth flow and old chat sidebar view
    // We will always keep an instance of this around (even when not visible) to handle states when no panels are open
    public sidebarChat: SidebarChatProvider
    private chatPanelsManager: ChatPanelsManager | undefined = undefined

    private options: SidebarChatOptions
    private onConfigurationChange: vscode.Disposable

    protected disposables: vscode.Disposable[] = []

    constructor({ extensionUri, ...options }: SidebarChatOptions) {
        this.options = { extensionUri, ...options }

        this.sidebarChat = new SidebarChatProvider(this.options)

        if (options.contextProvider.config.experimentalChatPanel) {
            this.createChatPanelsManger()
        }

        // Register Commands
        this.disposables.push(
            vscode.commands.registerCommand('cody.chat.history.export', async () => this.exportHistory()),
            vscode.commands.registerCommand('cody.chat.history.clear', async () => this.clearHistory()),
            vscode.commands.registerCommand('cody.chat.history.delete', async item => this.clearHistory(item))
        )

        // Register config change listener
        this.onConfigurationChange = options.contextProvider.configurationChangeEvent.event(async () => {
            const isChatPanelEnabled = options.contextProvider.config.experimentalChatPanel
            // When chat.chatPanel is set to true, the sidebar chat view will never be shown
            await vscode.commands.executeCommand('setContext', 'cody.chatPanel', isChatPanelEnabled)
            if (isChatPanelEnabled) {
                this.createChatPanelsManger()
            } else {
                this.disposeChatPanelsManager()
            }
        })
    }

    public async syncAuthStatus(authStatus: AuthStatus): Promise<void> {
        await this.chatPanelsManager?.syncAuthStatus(authStatus)
        if (!authStatus.isLoggedIn) {
            this.disposeChatPanelsManager()
        }
        await vscode.commands.executeCommand('setContext', 'cody.chatPanel', authStatus.isLoggedIn)
    }

    private async getChatProvider(isChatViewRequired = false): Promise<SidebarChatProvider | ChatPanelProvider> {
        if (!this.chatPanelsManager || !isChatViewRequired) {
            return this.sidebarChat
        }

        return this.chatPanelsManager.getChatProvider()
    }

    /**
     * Creates a new webview panel for chat.
     */
    public async createWebviewPanel(chatID?: string, chatQuestion?: string): Promise<ChatPanelProvider | undefined> {
        if (!this.chatPanelsManager) {
            return undefined
        }

        return this.chatPanelsManager.createWebviewPanel(chatID, chatQuestion)
    }

    public async setWebviewView(view: View): Promise<void> {
        const chatProvider = await this.getChatProvider()
        await chatProvider?.setWebviewView(view)
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

        if (!this.chatPanelsManager) {
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
        if (!this.chatPanelsManager) {
            await this.sidebarChat.clearHistory()
            return
        }

        const chatID = treeItem?.id
        if (chatID) {
            await this.sidebarChat.clearChatHistory(chatID)
            this.chatPanelsManager.clearHistory(chatID)
            return
        }

        if (!treeItem && this.chatPanelsManager) {
            // Show warning to users and get confirmation if they want to clear all history
            const userConfirmation = await vscode.window.showWarningMessage(
                'Are you sure you want to delete all of your chats?',
                { modal: true },
                'Delete All Chats'
            )

            if (!userConfirmation) {
                return
            }

            this.chatPanelsManager.clearHistory()
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

    public async restoreSession(chatID: string): Promise<void> {
        const chatProvider = await this.getChatProvider()
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

    private lastDisplayedNotice = ''
    public triggerNotice(notice: { key: string }): void {
        // we don't want to trigger the same notice twice to different views
        if (this.lastDisplayedNotice === notice.key) {
            return
        }

        this.lastDisplayedNotice = notice.key
        this.getChatProvider()
            .then(provider => provider.triggerNotice(notice))
            .catch(error => console.error(error))
    }

    private createChatPanelsManger(): void {
        if (!this.chatPanelsManager) {
            this.chatPanelsManager = new ChatPanelsManager(this.options)
            telemetryService.log('CodyVSCodeExtension:chatPanelsManger:activated', undefined, { hasV2Event: true })
        }
    }

    private disposeChatPanelsManager(): void {
        this.options.contextProvider.webview = this.sidebarChat.webview
        this.chatPanelsManager?.dispose()
        this.chatPanelsManager = undefined
    }

    public dispose(): void {
        this.disposeChatPanelsManager()
        this.onConfigurationChange.dispose()
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

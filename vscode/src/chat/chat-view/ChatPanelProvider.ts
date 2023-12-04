import * as vscode from 'vscode'

import { ChatModelProvider, ContextFile } from '@sourcegraph/cody-shared'
import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/prompts'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { ChatSubmitType } from '@sourcegraph/cody-ui/src/Chat'

import { View } from '../../../webviews/NavBar'
import { getFileContextFiles, getOpenTabsContextFile, getSymbolContextFiles } from '../../editor/utils/editor-context'
import { logDebug } from '../../log'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import { TreeViewProvider } from '../../services/TreeViewProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openFilePath, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { MessageErrorType, MessageProvider, MessageProviderOptions } from '../MessageProvider'
import { ConfigurationSubsetForWebview, ExtensionMessage, LocalEnv, WebviewMessage } from '../protocol'

import { getChatPanelTitle } from './chat-helpers'
import { addWebviewViewHTML, CodyChatPanelViewType } from './ChatManager'

export interface ChatViewProviderWebview extends Omit<vscode.Webview, 'postMessage'> {
    postMessage(message: ExtensionMessage): Thenable<boolean>
}

export interface ChatPanelProviderOptions extends MessageProviderOptions {
    extensionUri: vscode.Uri
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
}

export class ChatPanelProvider extends MessageProvider {
    private extensionUri: vscode.Uri
    private contextFilesQueryCancellation?: vscode.CancellationTokenSource
    public webview?: ChatViewProviderWebview
    public webviewPanel: vscode.WebviewPanel | undefined = undefined
    public treeView: TreeViewProvider
    private readonly featureFlagProvider: FeatureFlagProvider

    constructor({ treeView, extensionUri, featureFlagProvider, ...options }: ChatPanelProviderOptions) {
        super(options)
        this.extensionUri = extensionUri
        this.featureFlagProvider = featureFlagProvider
        this.treeView = treeView

        this.contextProvider.onDidChangeStatus(_ => {
            this.postEnhancedContextStatusToWebview()
        })
        // Hint local embeddings to start.
        void this.contextProvider.localEmbeddings?.start()
    }

    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                await this.handleWebviewContext()
                break
            case 'initialized':
                logDebug('ChatPanelProvider:onDidReceiveMessage', 'initialized')
                await this.init(this.startUpChatID)
                await this.handleChatModels()
                break
            case 'submit':
                return this.onHumanMessageSubmitted(
                    message.text,
                    message.submitType,
                    message.contextFiles,
                    message.addEnhancedContext
                )
            case 'edit':
                this.transcript.removeLastInteraction()
                await this.onHumanMessageSubmitted(message.text, 'user')
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
                break
            case 'abort':
                await this.abortCompletion()
                telemetryService.log(
                    'CodyVSCodeExtension:abortButton:clicked',
                    { source: 'sidebar' },
                    { hasV2Event: true }
                )
                telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
                break
            case 'get-chat-models':
                await this.handleChatModels()
                break
            case 'chatModel':
                this.chatModel = message.model
                this.transcript.setChatModel(message.model)
                break
            case 'executeRecipe':
                await this.executeRecipe(message.recipe, '', 'chat')
                break
            case 'getUserContext':
                await this.handleContextFiles(message.query)
                break
            case 'custom-prompt':
                await this.onCustomPromptClicked(message.title, message.value)
                break
            case 'insert':
                await handleCodeFromInsertAtCursor(message.text, message.metadata)
                break
            case 'newFile':
                handleCodeFromSaveToNewFile(message.text, message.metadata)
                await this.editor.createWorkspaceFile(message.text)
                break
            case 'copy':
                await handleCopiedCode(message.text, message.eventType === 'Button', message.metadata)
                break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            case 'links':
                void openExternalLinks(message.value)
                break
            case 'openFile':
                await openFilePath(message.filePath, this.webviewPanel?.viewColumn, message.range)
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range)
                break
            case 'embeddings/index':
                this.contextProvider.localEmbeddingsIndexRepository()
                break
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            default:
                this.handleError(new Error('Invalid request type from Webview Panel'), 'system')
        }
    }

    private async onHumanMessageSubmitted(
        text: string,
        submitType: ChatSubmitType,
        contextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        logDebug('ChatPanelProvider:onHumanMessageSubmitted', 'chat', { verbose: { text, submitType } })

        MessageProvider.inputHistory.push(text)

        if (submitType === 'suggestion') {
            const args = { requestID: this.currentRequestID }
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', args, { hasV2Event: true })
        }

        return this.executeRecipe('chat-question', text, 'chat', contextFiles, addEnhancedContext)
    }

    /**
     * Process custom command click
     */
    private async onCustomPromptClicked(title: string, commandType: CustomCommandType = 'user'): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:command:customMenu:clicked', undefined, { hasV2Event: true })
        logDebug('ChatPanelProvider:onCustomPromptClicked', title)
        if (!this.isCustomCommandAction(title)) {
            await this.setWebviewView('chat')
        }
        await this.executeCustomCommand(title, commandType)
    }

    /**
     * For Webview panel only
     * This sent the initiate contextStatus and config to webview
     */
    private async handleWebviewContext(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        const editorContext = this.editor.getActiveTextEditor()
        const contextStatus = {
            mode: this.contextProvider.config.useContext,
            endpoint: authStatus.endpoint || undefined,
            connection: this.contextProvider.context.checkEmbeddingsConnection(),
            embeddingsEndpoint: this.contextProvider.context.embeddingsEndpoint,
            codebase: this.contextProvider.context.getCodebase(),
            filePath: editorContext ? vscode.workspace.asRelativePath(editorContext.filePath) : undefined,
            selectionRange: editorContext?.selectionRange,
            supportsKeyword: true,
        }
        void this.webview?.postMessage({
            type: 'contextStatus',
            contextStatus,
        })

        const localProcess = await this.authProvider.appDetector.getProcessInfo(authStatus.isLoggedIn)
        const config: ConfigurationSubsetForWebview & LocalEnv = {
            ...localProcess,
            debugEnable: this.contextProvider.config.debugEnable,
            serverEndpoint: this.contextProvider.config.serverEndpoint,
            experimentalChatPanel: this.contextProvider.config.experimentalChatPanel,
        }
        void this.webview?.postMessage({
            type: 'config',
            config,
            authStatus,
        })
    }

    private async handleChatModels(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        if (authStatus?.configOverwrites?.chatModel) {
            ChatModelProvider.add(new ChatModelProvider(authStatus.configOverwrites.chatModel))
        }
        // selection is available to pro only at Dec GA
        const isGAFeatureFlagEnabled = await this.featureFlagProvider?.evaluateFeatureFlag(
            FeatureFlag.CodyDecGAFeatures
        )
        const models = ChatModelProvider.get(authStatus.endpoint, this.chatModel)?.map(model => {
            return {
                ...model,
                codyProOnly: isGAFeatureFlagEnabled ? model.codyProOnly : false,
            }
        })
        await this.webview?.postMessage({ type: 'chatModels', models })
    }

    /**
     * Send transcript to webview
     */
    protected handleTranscript(transcript: ChatMessage[], isMessageInProgress: boolean): void {
        void this.webview?.postMessage({
            type: 'transcript',
            messages: transcript,
            isMessageInProgress,
            chatID: this.sessionID,
        })

        // Update / reset webview panel title
        const text = this.transcript.getLastInteraction()?.getHumanMessage()?.displayText || 'New Chat'
        if (this.webviewPanel) {
            this.webviewPanel.title = getChatPanelTitle(text)
        }
    }

    /**
     * Send transcript error to webview
     */
    protected handleTranscriptErrors(transcriptError: boolean): void {
        void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: transcriptError })
    }

    protected handleSuggestions(suggestions: string[]): void {
        void this.webview?.postMessage({
            type: 'suggestions',
            suggestions,
        })
    }

    /**
     * Update chat history in Tree View
     */
    protected handleHistory(userHistory: UserLocalHistory): void {
        void this.webview?.postMessage({
            type: 'history',
            messages: userHistory,
        })
        void this.treeView.updateTree(createCodyChatTreeItems(userHistory))
    }

    /**
     * Display error message in webview, either as part of the transcript or as a banner alongside the chat.
     */
    public handleError(error: Error, type: MessageErrorType): void {
        if (type === 'transcript') {
            this.transcript.addErrorAsAssistantResponse(error)
            void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: true })
            return
        }

        void this.webview?.postMessage({ type: 'errors', errors: error.message })
    }

    protected handleCodyCommands(prompts: [string, CodyPrompt][]): void {
        void this.webview?.postMessage({
            type: 'custom-prompts',
            prompts,
        })
    }

    private async handleContextFiles(query: string): Promise<void> {
        if (!query.length) {
            const tabs = getOpenTabsContextFile()
            await this.webview?.postMessage({
                type: 'userContextFiles',
                context: tabs,
            })
            return
        }

        const cancellation = new vscode.CancellationTokenSource()

        try {
            const MAX_RESULTS = 20
            if (query.startsWith('#')) {
                // It would be nice if the VS Code symbols API supports
                // cancellation, but it doesn't
                const symbolResults = await getSymbolContextFiles(query.slice(1), MAX_RESULTS)
                // Check if cancellation was requested while getFileContextFiles
                // was executing, which means a new request has already begun
                // (i.e. prevent race conditions where slow old requests get
                // processed after later faster requests)
                if (!cancellation.token.isCancellationRequested) {
                    await this.webview?.postMessage({
                        type: 'userContextFiles',
                        context: symbolResults,
                    })
                }
            } else {
                const fileResults = await getFileContextFiles(query, MAX_RESULTS, cancellation.token)
                // Check if cancellation was requested while getFileContextFiles
                // was executing, which means a new request has already begun
                // (i.e. prevent race conditions where slow old requests get
                // processed after later faster requests)
                if (!cancellation.token.isCancellationRequested) {
                    await this.webview?.postMessage({
                        type: 'userContextFiles',
                        context: fileResults,
                    })
                }
            }
        } catch (error) {
            // Handle or log the error as appropriate
            console.error('Error retrieving context files:', error)
        } finally {
            // Cancel any previous search request after we update the UI
            // to avoid a flash of empty results as you type
            this.contextFilesQueryCancellation?.cancel()
            this.contextFilesQueryCancellation = cancellation
        }
    }

    /**
     *
     * @param notice Triggers displaying a notice.
     * @param notice.key The key of the notice to display.
     */
    public triggerNotice(notice: { key: string }): void {
        void this.webview?.postMessage({
            type: 'notice',
            notice,
        })
    }

    /**
     * Set webview view
     * NOTE: Panel doesn't support view other than 'chat' currently
     */
    public async setWebviewView(view: View): Promise<void> {
        await this.webview?.postMessage({
            type: 'view',
            messages: view,
        })

        if (!this.webviewPanel) {
            await this.createWebviewPanel(vscode.ViewColumn.Beside, this.sessionID)
        }
        this.webviewPanel?.reveal()
    }

    private startUpChatID?: string = undefined

    public async clearChatHistory(chatID?: string): Promise<void> {
        if (chatID) {
            await this.deleteHistory(chatID)
            return
        }
        await this.clearHistory()
        this.webviewPanel?.dispose()
    }

    /**
     * Creates the webview panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewPanel(
        activePanelViewColumn?: vscode.ViewColumn,
        chatID?: string,
        lastQuestion?: string
    ): Promise<vscode.WebviewPanel> {
        telemetryService.log('CodyVSCodeExtension:createWebviewPanel:clicked', undefined, { hasV2Event: true })

        // Checks if the webview panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanel) {
            return this.webviewPanel
        }

        this.startUpChatID = chatID

        const viewType = CodyChatPanelViewType
        const panelTitle = getChatPanelTitle(lastQuestion)
        const viewColumn = activePanelViewColumn || vscode.ViewColumn.Beside
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        const panel = vscode.window.createWebviewPanel(
            viewType,
            panelTitle,
            { viewColumn, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                enableFindWidget: true,
                localResourceRoots: [webviewPath],
                enableCommandUris: true,
            }
        )

        return this.registerWebviewPanel(panel)
    }

    /**
     * Revives the chat panel when the extension is reactivated.
     * Registers the existing webviewPanel and sets the chatID.
     */
    public async revive(webviewPanel: vscode.WebviewPanel, chatID: string): Promise<void> {
        logDebug('ChatPanelProvider:revive', 'reviving webview panel')
        this.startUpChatID = chatID
        await this.registerWebviewPanel(webviewPanel)
    }

    /**
     * Registers the given webview panel by setting up its options, icon, and handlers.
     * Also stores the panel reference and disposes it when closed.
     */
    private async registerWebviewPanel(panel: vscode.WebviewPanel): Promise<vscode.WebviewPanel> {
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'cody.png')

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionUri, panel)

        // Register webview
        this.webviewPanel = panel
        this.webview = panel.webview
        // TODO(abeatrix): ContextProvider is shared so each new chat panel
        // should not overwrite the context provider's webview, or it
        // will break the previous chat panel.
        this.contextProvider.webview = panel.webview
        this.authProvider.webview = panel.webview
        this.postEnhancedContextStatusToWebview()

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.webviewPanel = undefined
            panel.dispose()
        })

        this.disposables.push(panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))

        // Used for keeping sidebar chat view closed when webview panel is enabled
        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, true)

        return panel
    }

    // Sends context status updates to the webview, if any.
    private postEnhancedContextStatusToWebview(): void {
        void this.webview?.postMessage({
            type: 'enhanced-context',
            context: {
                groups: this.contextProvider.status,
            },
        })
    }
}

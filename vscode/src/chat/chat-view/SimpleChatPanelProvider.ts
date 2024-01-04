import * as path from 'path'

import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, ChatMessage, ContextFile } from '@sourcegraph/cody-shared'
import { ChatModelProvider } from '@sourcegraph/cody-shared/src/chat-models'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'
import {
    createDisplayTextWithFileLinks,
    createDisplayTextWithFileSelection,
} from '@sourcegraph/cody-shared/src/chat/prompts/display-text'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { TranscriptJSON } from '@sourcegraph/cody-shared/src/chat/transcript'
import { InteractionJSON } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Typewriter } from '@sourcegraph/cody-shared/src/chat/typewriter'
import { reformatBotMessageForChat } from '@sourcegraph/cody-shared/src/chat/viewHelpers'
import { ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { Result } from '@sourcegraph/cody-shared/src/local-context'
import { MAX_BYTES_PER_FILE, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateTextNearestLine } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isDotCom } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'
import { ContextWindowLimitError, isRateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { executeEdit } from '../../edit/execute'
import { getFileContextFiles, getOpenTabsContextFile, getSymbolContextFiles } from '../../editor/utils/editor-context'
import { VSCodeEditor } from '../../editor/vscode-editor'
import { ContextStatusAggregator } from '../../local-context/enhanced-context-status'
import { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { getProcessInfo } from '../../services/LocalAppDetector'
import { localStorage } from '../../services/LocalStorageProvider'
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
import { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'
import { MessageErrorType } from '../MessageProvider'
import { AuthStatus, ConfigurationSubsetForWebview, ExtensionMessage, LocalEnv, WebviewMessage } from '../protocol'
import { countGeneratedCode } from '../utils'

import {
    getChatPanelTitle,
    legacyContextFileUri,
    relativeFileUri,
    remoteEmbeddingSnippetUri,
    stripContextWrapper,
} from './chat-helpers'
import { ChatHistoryManager } from './ChatHistoryManager'
import { addWebviewViewHTML, CodyChatPanelViewType } from './ChatManager'
import { ChatViewProviderWebview, Config, IChatPanelProvider } from './ChatPanelsManager'
import { CodebaseStatusProvider } from './CodebaseStatusProvider'
import { InitDoer } from './InitDoer'
import { DefaultPrompter, IContextProvider, IPrompter } from './prompt'
import { ContextItem, MessageWithContext, SimpleChatModel, toViewMessage } from './SimpleChatModel'
import { SimpleChatRecipeAdapter } from './SimpleChatRecipeAdapter'

interface SimpleChatPanelProviderOptions {
    config: Config
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    embeddingsClient: CachedRemoteEmbeddingsClient
    localEmbeddings: LocalEmbeddingsController | null
    symf: SymfRunner | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
    recipeAdapter: SimpleChatRecipeAdapter
    models: ChatModelProvider[]
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    private _webviewPanel?: vscode.WebviewPanel
    public get webviewPanel(): vscode.WebviewPanel | undefined {
        return this._webviewPanel
    }
    private _webview?: ChatViewProviderWebview
    public get webview(): ChatViewProviderWebview | undefined {
        return this._webview
    }
    private initDoer = new InitDoer<boolean | undefined>()

    private chatModel: SimpleChatModel

    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []

    private config: Config
    private readonly authProvider: AuthProvider
    private readonly chatClient: ChatClient
    private readonly embeddingsClient: CachedRemoteEmbeddingsClient
    private readonly codebaseStatusProvider: CodebaseStatusProvider
    private readonly localEmbeddings: LocalEmbeddingsController | null
    private readonly symf: SymfRunner | null
    private readonly contextStatusAggregator = new ContextStatusAggregator()
    private readonly editor: VSCodeEditor
    private readonly treeView: TreeViewProvider

    private history = new ChatHistoryManager()
    private prompter: IPrompter = new DefaultPrompter()

    private contextFilesQueryCancellation?: vscode.CancellationTokenSource

    private readonly featureFlagProvider: FeatureFlagProvider

    // HACK: for now, we awkwardly need to keep this in sync with chatModel.sessionID,
    // as it is necessary to satisfy the IChatPanelProvider interface.
    public sessionID: string

    private recipeAdapter: SimpleChatRecipeAdapter

    constructor({
        config,
        extensionUri,
        featureFlagProvider,
        authProvider,
        chatClient,
        embeddingsClient,
        localEmbeddings,
        symf,
        editor,
        treeView,
        models,
        recipeAdapter,
    }: SimpleChatPanelProviderOptions) {
        this.config = config
        this.extensionUri = extensionUri
        this.featureFlagProvider = featureFlagProvider
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.localEmbeddings = localEmbeddings
        this.symf = symf
        this.editor = editor
        this.treeView = treeView
        this.recipeAdapter = recipeAdapter
        this.chatModel = new SimpleChatModel(this.selectModel(models))
        this.sessionID = this.chatModel.sessionID

        // Advise local embeddings to start up if necessary.
        void this.localEmbeddings?.start()

        // Push context status to the webview when it changes.
        this.disposables.push(this.contextStatusAggregator.onDidChangeStatus(() => this.postContextStatusToWebView()))
        this.disposables.push(this.contextStatusAggregator)
        if (this.localEmbeddings) {
            this.disposables.push(this.contextStatusAggregator.addProvider(this.localEmbeddings))
        }
        this.codebaseStatusProvider = new CodebaseStatusProvider(
            this.editor,
            embeddingsClient,
            this.config.experimentalSymfContext ? this.symf : null
        )
        this.disposables.push(this.contextStatusAggregator.addProvider(this.codebaseStatusProvider))
    }

    // Select the chat model to use in Chat
    private selectModel(models: ChatModelProvider[]): string {
        // Check for the last selected model
        const lastSelectedModelID = localStorage.get('model')
        if (lastSelectedModelID) {
            // If the last selected model exists in the list of models then we return it
            const model = models.find(m => m.model === lastSelectedModelID)
            if (model) {
                return lastSelectedModelID
            }
        }
        // If the user has not selected a model before then we return the default model
        const defaultModel = models.find(m => m.default) || models[0]
        if (!defaultModel) {
            throw new Error('No chat model found in server-provided config')
        }
        return defaultModel.model
    }

    private completionCanceller?: () => void

    private cancelInProgressCompletion(): void {
        if (this.completionCanceller) {
            this.completionCanceller()
            this.completionCanceller = undefined
        }
    }

    /**
     * Creates the webview panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewPanel(
        activePanelViewColumn?: vscode.ViewColumn,
        _chatId?: string,
        lastQuestion?: string
    ): Promise<vscode.WebviewPanel> {
        // Checks if the webview panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanel) {
            return this.webviewPanel
        }

        const viewType = CodyChatPanelViewType
        const panelTitle =
            this.history.getChat(this.authProvider.getAuthStatus(), this.sessionID)?.chatTitle ||
            getChatPanelTitle(lastQuestion)
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
     */
    public async revive(webviewPanel: vscode.WebviewPanel): Promise<void> {
        logDebug('SimpleChatPanelProvider:revive', 'registering webview panel')
        await this.registerWebviewPanel(webviewPanel)
    }

    /**
     * Registers the given webview panel by setting up its options, icon, and handlers.
     * Also stores the panel reference and disposes it when closed.
     */
    private async registerWebviewPanel(panel: vscode.WebviewPanel): Promise<vscode.WebviewPanel> {
        logDebug('SimpleChatPanelProvider:registerWebviewPanel', 'registering webview panel')
        if (this.webviewPanel || this.webview) {
            throw new Error('Webview or webview panel already registered')
        }

        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'active-chat-icon.svg')

        // Reset the webview options to ensure localResourceRoots is up-to-date
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionUri, panel)

        // Register webview
        this._webviewPanel = panel
        this._webview = panel.webview
        this.postContextStatusToWebView()

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.cancelInProgressCompletion()
            this._webviewPanel = undefined
            this._webview = undefined
            panel.dispose()
        })

        this.disposables.push(panel.webview.onDidReceiveMessage(message => this.onDidReceiveMessage(message)))

        // Used for keeping sidebar chat view closed when webview panel is enabled
        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, true)

        return panel
    }

    private postContextStatusToWebView(): void {
        logDebug(
            'SimpleChatPanelProvider',
            'postContextStatusToWebView',
            JSON.stringify(this.contextStatusAggregator.status)
        )
        void this.postMessage({
            type: 'enhanced-context',
            context: {
                groups: this.contextStatusAggregator.status,
            },
        })
    }

    public async setWebviewView(view: View): Promise<void> {
        if (!this.webviewPanel) {
            await this.createWebviewPanel()
        }
        this.webviewPanel?.reveal()

        await this.postMessage({
            type: 'view',
            messages: view,
        })
    }

    /**
     * This is the entrypoint for handling messages from the webview.
     */
    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.postViewConfig()
                break
            case 'initialized':
                logDebug('SimpleChatPanelProvider:onDidReceiveMessage', 'initialized')
                await this.onInitialized()
                break
            case 'reset':
                await this.clearAndRestartSession()
                break
            case 'submit': {
                const requestID = uuid.v4()
                await this.handleHumanMessageSubmitted(
                    requestID,
                    message.text,
                    message.submitType,
                    message.contextFiles || [],
                    message.addEnhancedContext || false
                )
                break
            }
            case 'edit': {
                const requestID = uuid.v4()
                await this.handleEdit(requestID, message.text)
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')
                break
            }
            case 'abort':
                this.cancelInProgressCompletion()
                telemetryService.log(
                    'CodyVSCodeExtension:abortButton:clicked',
                    { source: 'sidebar' },
                    { hasV2Event: true }
                )
                telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
                break
            case 'chatModel':
                this.chatModel.modelID = message.model
                // Store the selected model in local storage to retrieve later
                await localStorage.set('model', message.model)
                break
            case 'get-chat-models':
                await this.postChatModels()
                break
            case 'executeRecipe':
                void this.executeRecipe(message.recipe)
                break
            case 'getUserContext':
                await this.handleContextFiles(message.query)
                break
            case 'custom-prompt':
                await this.executeCustomCommand(message.title)
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
                await openFilePath(message.filePath, message.uri, this.webviewPanel?.viewColumn, message.range)
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range)
                break
            case 'embeddings/index':
                void this.localEmbeddings?.index()
                break
            case 'symf/index': {
                void this.codebaseStatusProvider.currentCodebase().then((codebase): void => {
                    if (codebase) {
                        void this.symf?.ensureIndex(codebase.local, { hard: true })
                    }
                })
                break
            }
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            default:
                this.postError(new Error(`Invalid request type from Webview Panel: ${message.command}`))
        }
    }

    private async onInitialized(): Promise<void> {
        // HACK: this call is necessary to get the webview to set the chatID state,
        // which is necessary on deserialization. It should be invoked before the
        // other initializers run (otherwise, it might interfere with other view
        // state)
        await this.webview?.postMessage({
            type: 'transcript',
            messages: [],
            isMessageInProgress: false,
            chatID: this.sessionID,
        })

        await this.postChatModels()
        await this.saveSession()
        await this.postCodyCommands()
        this.initDoer.signalInitialized()
    }

    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose())
        this.disposables = []
    }

    /**
     * Attempts to restore the chat to the given sessionID, if it exists in
     * history. If it does, then saves the current session and cancels the
     * current in-progress completion. If the chat does not exist, then this
     * is a no-op.
     */
    public async restoreSession(sessionID: string): Promise<void> {
        const oldTranscript = this.history.getChat(this.authProvider.getAuthStatus(), sessionID)
        if (!oldTranscript) {
            return
        }
        this.cancelInProgressCompletion()
        const newModel = await newChatModelfromTranscriptJSON(oldTranscript, this.chatModel.modelID)
        this.chatModel = newModel
        this.sessionID = newModel.sessionID

        this.postViewTranscript()
    }

    public async saveSession(humanInput?: string): Promise<void> {
        const allHistory = await this.history.saveChat(
            this.authProvider.getAuthStatus(),
            this.chatModel.toTranscriptJSON(),
            humanInput
        )
        if (allHistory) {
            void this.postMessage({
                type: 'history',
                messages: allHistory,
            })
        }
        await this.treeView.updateTree(createCodyChatTreeItems(this.authProvider.getAuthStatus()))
    }

    public async clearAndRestartSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }

        this.cancelInProgressCompletion()
        await this.saveSession()

        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.sessionID = this.chatModel.sessionID
        this.postViewTranscript()
    }

    public handleChatTitle(title: string): void {
        this.chatModel.setChatTitle(title)
        if (this.webviewPanel) {
            this.webviewPanel.title = title
        }
    }

    public triggerNotice(notice: { key: string }): void {
        void this.postMessage({
            type: 'notice',
            notice,
        })
    }

    private async postChatModels(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        if (!authStatus?.isLoggedIn) {
            return
        }
        if (authStatus?.configOverwrites?.chatModel) {
            ChatModelProvider.add(new ChatModelProvider(authStatus.configOverwrites.chatModel))
        }
        // selection is available to pro only at Dec GA
        const isCodyProFeatureFlagEnabled = await this.featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyPro)
        const models = ChatModelProvider.get(authStatus.endpoint, this.chatModel.modelID)?.map(model => {
            return {
                ...model,
                codyProOnly: isCodyProFeatureFlagEnabled ? model.codyProOnly : false,
            }
        })

        void this.postMessage({
            type: 'chatModels',
            models,
        })
    }

    private async handleHumanMessageSubmitted(
        requestID: string,
        text: string,
        submitType: 'user' | 'suggestion' | 'example',
        userContextFiles: ContextFile[],
        addEnhancedContext: boolean
    ): Promise<void> {
        if (submitType === 'suggestion') {
            const args = { requestID }
            telemetryService.log('CodyVSCodeExtension:chatPredictions:used', args, { hasV2Event: true })
        }

        // If this is a slash command, run it with custom prompt recipe instead
        if (text.startsWith('/')) {
            if (text.match(/^\/r(eset)?$/)) {
                await this.clearAndRestartSession()
                return
            }
            if (text.match(/^\/edit(\s)?/)) {
                await executeEdit({ instruction: text.replace(/^\/(edit)/, '').trim() }, 'chat')
                return
            }
            if (text.match(/^\/doc(\s)?/)) {
                await vscode.commands.executeCommand('cody.command.document-code')
                return
            }
            if (text === '/commands-settings') {
                // User has clicked the settings button for commands
                await vscode.commands.executeCommand('cody.settings.commands')
                return
            }
            return this.executeRecipe('custom-prompt', text.trim(), 'chat', userContextFiles, false)
        }

        const displayText = userContextFiles?.length
            ? createDisplayTextWithFileLinks(userContextFiles, text)
            : createDisplayTextWithFileSelection(text, this.editor.getActiveTextEditorSelection())
        this.chatModel.addHumanMessage({ text }, displayText)
        await this.saveSession(text)
        // trigger the context progress indicator
        this.postViewTranscript({ speaker: 'assistant' })
        await this.generateAssistantResponse(requestID, userContextFiles, addEnhancedContext, contextSummary => {
            if (submitType !== 'user') {
                return
            }

            const authStatus = this.authProvider.getAuthStatus()

            const properties = {
                requestID,
                chatModel: this.chatModel.modelID,
                // 🚨 SECURITY: included only for DotCom users.
                promptText: authStatus.endpoint && isDotCom(authStatus.endpoint) ? text : undefined,
                contextSummary,
            }
            telemetryService.log('CodyVSCodeExtension:chat-question:recipe-used', properties, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.recipe.chat-question', 'recipe-used', {
                metadata: { ...contextSummary },
            })
        })
        // Set the title of the webview panel to the current text
        if (this.webviewPanel) {
            this.webviewPanel.title =
                this.history.getChat(this.authProvider.getAuthStatus(), this.sessionID)?.chatTitle ||
                getChatPanelTitle(text)
        }
    }

    private async handleEdit(requestID: string, text: string): Promise<void> {
        this.chatModel.updateLastHumanMessage({ text })
        this.postViewTranscript()
        await this.generateAssistantResponse(requestID)
    }

    private async postViewConfig(): Promise<void> {
        const config = await getFullConfig()
        const authStatus = this.authProvider.getAuthStatus()
        const localProcess = getProcessInfo()
        const configForWebview: ConfigurationSubsetForWebview & LocalEnv = {
            ...localProcess,
            debugEnable: config.debugEnable,
            serverEndpoint: config.serverEndpoint,
            experimentalGuardrails: config.experimentalGuardrails,
        }
        await this.postMessage({ type: 'config', config: configForWebview, authStatus })
        logDebug('SimpleChatPanelProvider', 'updateViewConfig', { verbose: configForWebview })
    }

    private async generateAssistantResponse(
        requestID: string,
        userContextFiles?: ContextFile[],
        addEnhancedContext = true,
        sendTelemetry?: (contextSummary: {}) => void
    ): Promise<void> {
        try {
            const contextWindowBytes = getContextWindowForModel(
                this.authProvider.getAuthStatus(),
                this.chatModel.modelID
            )

            const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [], true)
            const contextProvider = new ContextProvider(
                userContextItems,
                this.editor,
                this.embeddingsClient,
                this.localEmbeddings,
                this.config.experimentalSymfContext ? this.symf : null,
                this.codebaseStatusProvider
            )
            const { prompt, contextLimitWarnings, newContextUsed } = await this.prompter.makePrompt(
                this.chatModel,
                contextProvider,
                addEnhancedContext,
                contextWindowBytes
            )

            this.chatModel.setNewContextUsed(newContextUsed)

            if (contextLimitWarnings.length > 0) {
                const warningMsg = contextLimitWarnings
                    .map(w => (w.trim().endsWith('.') ? w.trim() : w.trim() + '.'))
                    .join(' ')
                this.postError(new ContextWindowLimitError(warningMsg), 'transcript')
            }

            if (sendTelemetry) {
                // Create a summary of how many code snippets of each context source are being
                // included in the prompt
                const contextSummary: { [key: string]: number } = {}
                for (const { source } of newContextUsed) {
                    if (!source) {
                        continue
                    }
                    if (contextSummary[source]) {
                        contextSummary[source] += 1
                    } else {
                        contextSummary[source] = 1
                    }
                }
                sendTelemetry(contextSummary)
            }

            this.postViewTranscript({ speaker: 'assistant' })

            this.sendLLMRequest(prompt, {
                update: content => {
                    this.postViewTranscript(
                        toViewMessage({
                            message: {
                                speaker: 'assistant',
                                text: content,
                            },
                            newContextUsed,
                        })
                    )
                },
                close: content => {
                    this.addBotMessage(requestID, content)
                },
                error: (partialResponse, error) => {
                    if (isAbortError(error)) {
                        this.chatModel.addBotMessage({ text: partialResponse })
                    } else {
                        this.postError(error, 'transcript')
                    }
                    this.postViewTranscript()
                },
            })
        } catch (error) {
            if (isRateLimitError(error)) {
                this.postError(error, 'transcript')
            } else {
                this.postError(isError(error) ? error : new Error(`Error generating assistant response: ${error}`))
            }
        }
    }

    /**
     * Issue the chat request and stream the results back, updating the model and view
     * with the response.
     */
    private sendLLMRequest(
        prompt: Message[],
        callbacks: {
            update: (response: string) => void
            close: (finalResponse: string) => void
            error: (completedResponse: string, error: Error) => void
        }
    ): void {
        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
                lastContent = content
                callbacks.update(content)
            },
            close: () => {
                callbacks.close(lastContent)
            },
        })

        this.cancelInProgressCompletion()
        this.completionCanceller = this.chatClient.chat(
            prompt,
            {
                onChange: (content: string) => {
                    typewriter.update(content)
                },
                onComplete: () => {
                    this.completionCanceller = undefined
                    typewriter.close()
                    typewriter.stop()
                },
                onError: error => {
                    this.cancelInProgressCompletion()
                    typewriter.close()
                    typewriter.stop(error)
                    callbacks.error(lastContent, error)
                },
            },
            { model: this.chatModel.modelID }
        )
    }

    // Handler to fetch context files candidates
    private async handleContextFiles(query: string): Promise<void> {
        if (!query.length) {
            const tabs = getOpenTabsContextFile()
            await this.postMessage({
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
                    await this.postMessage({
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
                    await this.postMessage({
                        type: 'userContextFiles',
                        context: fileResults,
                    })
                }
            }
        } catch (error) {
            this.postError(new Error(`Error retrieving context files: ${error}`))
        } finally {
            // Cancel any previous search request after we update the UI
            // to avoid a flash of empty results as you type
            this.contextFilesQueryCancellation?.cancel()
            this.contextFilesQueryCancellation = cancellation
        }
    }

    private postViewTranscript(messageInProgress?: ChatMessage): void {
        const messages: ChatMessage[] = this.chatModel.getMessagesWithContext().map(m => toViewMessage(m))
        if (messageInProgress) {
            messages.push(messageInProgress)
        }

        // We never await on postMessage, because it can sometimes hang indefinitely:
        // https://github.com/microsoft/vscode/issues/159431
        void this.postMessage({
            type: 'transcript',
            messages,
            isMessageInProgress: !!messageInProgress,
            chatID: this.sessionID,
        })

        const chatTitle = this.history.getChat(this.authProvider.getAuthStatus(), this.sessionID)?.chatTitle
        if (chatTitle) {
            this.handleChatTitle(chatTitle)
            return
        }
        // Update webview panel title to match the last message
        const text = this.chatModel.getLastHumanMessage()?.displayText
        if (this.webviewPanel && text) {
            this.webviewPanel.title = getChatPanelTitle(text)
        }
    }

    /**
     * Display error message in webview as part of the chat transcript, or as a system banner alongside the chat.
     */
    private postError(error: Error, type?: MessageErrorType): void {
        // Add error to transcript
        if (type === 'transcript') {
            this.chatModel.addErrorAsBotMessage(error)
            this.postViewTranscript()
            void this.postMessage({ type: 'transcript-errors', isTranscriptError: true })
            return
        }

        void this.postMessage({ type: 'errors', errors: error.message })
    }

    /**
     * Finalizes adding a bot message to the chat model and triggers an update to the view.
     */
    private addBotMessage(requestID: string, rawResponse: string): void {
        const displayText = reformatBotMessageForChat(rawResponse, '')
        this.chatModel.addBotMessage({ text: rawResponse }, displayText)
        void this.saveSession()
        this.postViewTranscript()

        // Count code generated from response
        const codeCount = countGeneratedCode(rawResponse)
        if (codeCount?.charCount) {
            // const metadata = lastInteraction?.getHumanMessage().metadata
            telemetryService.log(
                'CodyVSCodeExtension:chatResponse:hasCode',
                { ...codeCount, requestID },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.chatResponse.new', 'hasCode', {
                metadata: {
                    ...codeCount,
                },
            })
        }
    }

    public setConfiguration(newConfig: Config): void {
        this.config = newConfig
    }

    public async executeRecipe(
        recipeID: RecipeID,
        humanChatInput = '',
        _source?: ChatEventSource,
        userInputContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        try {
            const requestID = uuid.v4()
            const recipeMessages = await this.recipeAdapter.computeRecipeMessages(
                requestID,
                recipeID,
                humanChatInput,
                userInputContextFiles,
                addEnhancedContext
            )
            if (!recipeMessages) {
                return
            }
            const displayText = this.editor.getActiveTextEditorSelection()
                ? createDisplayTextWithFileSelection(humanChatInput, this.editor.getActiveTextEditorSelection())
                : humanChatInput
            const { humanMessage, prompt, error } = recipeMessages
            this.chatModel.addHumanMessage(humanMessage.message, displayText)
            if (humanMessage.newContextUsed) {
                this.chatModel.setNewContextUsed(humanMessage.newContextUsed)
            }
            await this.saveSession()
            this.postViewTranscript({ speaker: 'assistant' })

            if (error) {
                this.chatModel.addBotMessage({ text: typeof error === 'string' ? error : error.message })
                this.postViewTranscript()
                return
            }

            this.sendLLMRequest(prompt, {
                update: (responseText: string) => {
                    this.postViewTranscript(
                        toViewMessage({
                            message: {
                                speaker: 'assistant',
                                text: responseText,
                            },
                            newContextUsed: humanMessage.newContextUsed,
                        })
                    )
                },
                close: (responseText: string) => {
                    this.addBotMessage(requestID, responseText)
                },
                error: (partialResponse: string, error: Error) => {
                    if (isAbortError(error)) {
                        this.chatModel.addBotMessage({ text: partialResponse })
                    } else {
                        this.postError(error, 'transcript')
                    }
                    this.postViewTranscript()
                },
            })
        } catch (error) {
            this.postError(new Error(`command ${recipeID} failed: ${error}`))
        }
    }

    public async executeCustomCommand(title: string): Promise<void> {
        await this.executeRecipe('custom-prompt', title)
    }

    /**
     * Send a list of commands to webview that can be triggered via chat input box with slash
     */
    private async postCodyCommands(): Promise<void> {
        const send = async (): Promise<void> => {
            await this.editor.controllers.command?.refresh()
            const allCommands = await this.editor.controllers.command?.getAllCommands(true)
            // HACK: filter out commands that make inline changes and /ask (synonymous with a generic question)
            const prompts =
                allCommands?.filter(([id, { mode }]) => {
                    /** The /ask command is only useful outside of chat */
                    const isRedundantCommand = id === '/ask'
                    /**
                     * Hack: Custom edit commands are currently broken in this chat.
                     * We filter our anything that has this mode, apart from our own internal doc command - which we override ourselves
                     */
                    const isCustomEdit = (mode === 'edit' || mode === 'insert') && id !== '/doc'
                    return !isRedundantCommand && !isCustomEdit
                }) || []

            void this.postMessage({
                type: 'custom-prompts',
                prompts,
            })
        }
        this.editor.controllers.command?.setMessenger(send)
        await send()
    }

    /**
     * Posts a message to the webview, pending initialization.
     *
     * cody-invariant: this.webview?.postMessage should never be invoked directly
     * except within this method.
     */
    private postMessage(message: ExtensionMessage): Thenable<boolean | undefined> {
        return this.initDoer.do(() => this.webview?.postMessage(message))
    }
}

class ContextProvider implements IContextProvider {
    constructor(
        private userContext: ContextItem[],
        private editor: Editor,
        private embeddingsClient: CachedRemoteEmbeddingsClient | null,
        private localEmbeddings: LocalEmbeddingsController | null,
        private symf: SymfRunner | null,
        private codebaseStatusProvider: CodebaseStatusProvider
    ) {}

    public getExplicitContext(): ContextItem[] {
        return this.userContext
    }

    private getUserAttentionContext(): ContextItem[] {
        return this.getVisibleEditorContext()
    }

    private getCurrentSelectionContext(): ContextItem[] {
        const selection = this.editor.getActiveTextEditorSelection()
        if (!selection) {
            return []
        }
        let range: vscode.Range | undefined
        if (selection.selectionRange) {
            range = new vscode.Range(
                selection.selectionRange.start.line,
                selection.selectionRange.start.character,
                selection.selectionRange.end.line,
                selection.selectionRange.end.character
            )
        }

        return [
            {
                text: selection.selectedText,
                uri: selection.fileUri || vscode.Uri.file(selection.fileName),
                range,
            },
        ]
    }

    private getVisibleEditorContext(): ContextItem[] {
        const visible = this.editor.getActiveTextEditorVisibleContent()
        if (!visible || isCodyIgnoredFile(vscode.Uri.file(visible.fileName))) {
            return []
        }
        return [
            {
                text: visible.content,
                uri: vscode.Uri.file(visible.fileName),
            },
        ]
    }

    public async getEnhancedContext(text: string): Promise<ContextItem[]> {
        const searchContext: ContextItem[] = []
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (start)')
        let hasEmbeddingsContext = false
        const localEmbeddingsResults = this.searchEmbeddingsLocal(text)
        const remoteEmbeddingsResults = this.searchEmbeddingsRemote(text)
        try {
            const r = await localEmbeddingsResults
            hasEmbeddingsContext = hasEmbeddingsContext || r.length > 0
            searchContext.push(...r)
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > local embeddings', error)
        }
        try {
            const r = await remoteEmbeddingsResults
            hasEmbeddingsContext = hasEmbeddingsContext || r.length > 0
            searchContext.push(...r)
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > remote embeddings', error)
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (end)')

        if (!hasEmbeddingsContext && this.symf) {
            try {
                // Fallback to symf if embeddings provided no results
                searchContext.push(...(await this.searchSymf(text)))
            } catch (error) {
                // TODO(beyang): handle this error better
                logDebug('SimpleChatPanelProvider.getEnhancedContext', 'searchSymf error', error)
            }
        }

        const priorityContext: ContextItem[] = []
        const selectionContext = this.getCurrentSelectionContext()
        if (selectionContext.length > 0) {
            priorityContext.push(...selectionContext)
        } else if (this.needsUserAttentionContext(text)) {
            // Query refers to current editor
            priorityContext.push(...this.getUserAttentionContext())
        } else if (this.needsReadmeContext(text)) {
            // Query refers to project, so include the README
            let containsREADME = false
            for (const contextItem of searchContext) {
                const basename = path.basename(contextItem.uri.fsPath)
                if (basename.toLocaleLowerCase() === 'readme' || basename.toLocaleLowerCase().startsWith('readme.')) {
                    containsREADME = true
                    break
                }
            }
            if (!containsREADME) {
                priorityContext.push(...(await this.getReadmeContext()))
            }
        }

        return priorityContext.concat(searchContext)
    }

    /**
     * Uses symf to conduct a local search within the current workspace folder
     */
    private async searchSymf(userText: string, blockOnIndex = false): Promise<ContextItem[]> {
        if (!this.symf) {
            return []
        }
        const workspaceRoot = this.editor.getWorkspaceRootUri()?.fsPath
        if (!workspaceRoot) {
            return []
        }

        const indexExists = await this.symf.getIndexStatus(workspaceRoot)
        if (indexExists !== 'ready' && !blockOnIndex) {
            void this.symf.ensureIndex(workspaceRoot, { hard: false })
            return []
        }

        const r0 = (await this.symf.getResults(userText, [workspaceRoot])).flatMap(async results => {
            const items = (await results).flatMap(async (result: Result): Promise<ContextItem[] | ContextItem> => {
                const uri = vscode.Uri.file(result.file)
                if (isCodyIgnoredFile(uri)) {
                    return []
                }
                const range = new vscode.Range(
                    result.range.startPoint.row,
                    result.range.startPoint.col,
                    result.range.endPoint.row,
                    result.range.endPoint.col
                )

                // HACK: we should standardize URI schemes at some point. The way
                // in which this is handed to the view and received back is a bit
                // jank
                const displayUri = relativeFileUri(workspaceRoot, path.relative(workspaceRoot, result.file), range)

                let text
                try {
                    text = await this.editor.getTextEditorContentForFile(uri, range)
                    if (!text) {
                        return []
                    }
                } catch (error) {
                    logError('SimpleChatPanelProvider.searchSymf', `Error getting file contents: ${error}`)
                    return []
                }
                return {
                    uri: displayUri,
                    range,
                    text,
                }
            })
            return (await Promise.all(items)).flat()
        })
        return (await Promise.all(r0)).flat()
    }

    private async searchEmbeddingsLocal(text: string): Promise<ContextItem[]> {
        if (!this.localEmbeddings) {
            return []
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching local embeddings')
        const contextItems: ContextItem[] = []
        const embeddingsResults = await this.localEmbeddings.getContext(text, NUM_CODE_RESULTS + NUM_TEXT_RESULTS)

        for (const result of embeddingsResults) {
            const range = new vscode.Range(
                new vscode.Position(result.startLine, 0),
                new vscode.Position(result.endLine, 0)
            )
            const uri = relativeFileUri('', result.fileName, range)

            // Filter out ignored files
            if (!isCodyIgnoredFile(vscode.Uri.file(result.fileName))) {
                contextItems.push({
                    uri,
                    range,
                    text: result.content,
                    source: 'embeddings',
                })
            }
        }
        return contextItems
    }

    // Note: does not throw error if remote embeddings are not available, just returns empty array
    private async searchEmbeddingsRemote(text: string): Promise<ContextItem[]> {
        if (!this.embeddingsClient) {
            return []
        }
        const codebase = await this.codebaseStatusProvider?.currentCodebase()
        if (!codebase?.remote) {
            return []
        }
        const repoId = await this.embeddingsClient.getRepoIdIfEmbeddingExists(codebase.remote)
        if (isError(repoId)) {
            throw new Error(`Error retrieving repo ID: ${repoId}`)
        } else if (!repoId) {
            return []
        }

        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching remote embeddings')
        const contextItems: ContextItem[] = []
        const embeddings = await this.embeddingsClient.search([repoId], text, NUM_CODE_RESULTS, NUM_TEXT_RESULTS)
        if (isError(embeddings)) {
            throw new Error(`Error retrieving embeddings: ${embeddings}`)
        }
        for (const codeResult of embeddings.codeResults) {
            const uri = remoteEmbeddingSnippetUri(codebase, codeResult)
            const range = new vscode.Range(
                new vscode.Position(codeResult.startLine, 0),
                new vscode.Position(codeResult.endLine, 0)
            )
            if (!isCodyIgnoredFile(vscode.Uri.file(path.join(codebase.local, codeResult.fileName)))) {
                contextItems.push({
                    uri,
                    range,
                    text: codeResult.content,
                    source: 'embeddings',
                })
            }
        }

        for (const textResult of embeddings.textResults) {
            const uri = remoteEmbeddingSnippetUri(codebase, textResult)
            const range = new vscode.Range(
                new vscode.Position(textResult.startLine, 0),
                new vscode.Position(textResult.endLine, 0)
            )
            if (!isCodyIgnoredFile(vscode.Uri.file(path.join(codebase.local, textResult.fileName)))) {
                contextItems.push({
                    uri,
                    range,
                    text: textResult.content,
                    source: 'embeddings',
                })
            }
        }

        return contextItems
    }

    private needsReadmeContext(input: string): boolean {
        input = input.toLowerCase()
        const question = extractQuestion(input)
        if (!question) {
            return false
        }

        // split input into words, discarding spaces and punctuation
        const words = input.split(/\W+/).filter(w => w.length > 0)
        const bagOfWords = Object.fromEntries(words.map(w => [w, true]))

        const projectSignifiers = ['project', 'repository', 'repo', 'library', 'package', 'module', 'codebase']
        const questionIndicators = ['what', 'how', 'describe', 'explain', '?']

        const workspaceUri = this.editor.getWorkspaceRootUri()
        if (workspaceUri) {
            const rootBase = workspaceUri.toString().split('/').at(-1)
            if (rootBase) {
                projectSignifiers.push(rootBase.toLowerCase())
            }
        }

        let containsProjectSignifier = false
        for (const p of projectSignifiers) {
            if (bagOfWords[p]) {
                containsProjectSignifier = true
                break
            }
        }

        let containsQuestionIndicator = false
        for (const q of questionIndicators) {
            if (bagOfWords[q]) {
                containsQuestionIndicator = true
                break
            }
        }

        return containsQuestionIndicator && containsProjectSignifier
    }

    private static userAttentionRegexps: RegExp[] = [
        /editor/,
        /(open|current|this|entire)\s+file/,
        /current(ly)?\s+open/,
        /have\s+open/,
    ]

    private needsUserAttentionContext(input: string): boolean {
        const inputLowerCase = input.toLowerCase()
        // If the input matches any of the `editorRegexps` we assume that we have to include
        // the editor context (e.g., currently open file) to the overall message context.
        for (const regexp of ContextProvider.userAttentionRegexps) {
            if (inputLowerCase.match(regexp)) {
                return true
            }
        }
        return false
    }

    private async getReadmeContext(): Promise<ContextItem[]> {
        // global pattern for readme file
        const readmeGlobalPattern = '{README,README.,readme.,Readm.}*'
        const readmeUri = (await vscode.workspace.findFiles(readmeGlobalPattern, undefined, 1)).at(0)
        if (!readmeUri || isCodyIgnoredFile(readmeUri)) {
            return []
        }
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri)
        const readmeText = readmeDoc.getText()
        const { truncated: truncatedReadmeText, range } = truncateTextNearestLine(readmeText, MAX_BYTES_PER_FILE)
        if (truncatedReadmeText.length === 0) {
            return []
        }

        let readmeDisplayUri = readmeUri
        const wsFolder = vscode.workspace.getWorkspaceFolder(readmeUri)
        if (wsFolder) {
            const readmeRelPath = path.relative(wsFolder.uri.fsPath, readmeUri.fsPath)
            if (readmeRelPath) {
                readmeDisplayUri = relativeFileUri(wsFolder.uri.fsPath, readmeRelPath, range)
            }
        }

        return [
            {
                uri: readmeDisplayUri,
                text: truncatedReadmeText,
                range: viewRangeToRange(range),
            },
        ]
    }
}

function contextFilesToContextItems(
    editor: Editor,
    files: ContextFile[],
    fetchContent?: boolean
): Promise<ContextItem[]> {
    return Promise.all(
        files.map(async (file: ContextFile): Promise<ContextItem> => {
            const range = viewRangeToRange(file.range)
            const uri = file.uri
                ? // This object may have came via postMessage and might not be a
                  // real vscode.Uri instance so convert it if required (otherwise
                  // toString() later will be '[Object object]' and not what we
                  // expect).
                  typeof file.uri === 'object'
                    ? vscode.Uri.from(file.uri)
                    : file.uri
                : vscode.Uri.file(file.fileName)
            let text = file.content
            if (!text && fetchContent) {
                text = await editor.getTextEditorContentForFile(uri, range)
            }
            return {
                uri,
                range,
                text: text || '',
            }
        })
    )
}

function viewRangeToRange(range?: ActiveTextEditorSelectionRange): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

async function newChatModelfromTranscriptJSON(json: TranscriptJSON, modelID: string): Promise<SimpleChatModel> {
    const messages: MessageWithContext[][] = json.interactions.map(
        (interaction: InteractionJSON): MessageWithContext[] => {
            return [
                {
                    message: {
                        speaker: 'human',
                        text: interaction.humanMessage.text,
                    },
                    displayText: interaction.humanMessage.displayText,
                    newContextUsed: deserializedContextFilesToContextItems(
                        interaction.usedContextFiles,
                        interaction.fullContext
                    ),
                },
                {
                    message: {
                        speaker: 'assistant',
                        text: interaction.assistantMessage.text,
                    },
                    displayText: interaction.assistantMessage.displayText,
                },
            ]
        }
    )
    return new SimpleChatModel(json.chatModel || modelID, (await Promise.all(messages)).flat(), json.id, json.chatTitle)
}

function deserializedContextFilesToContextItems(
    files: ContextFile[],
    contextMessages: ContextMessage[]
): ContextItem[] {
    const contextByFile = new Map<string, ContextMessage>()
    for (const contextMessage of contextMessages) {
        if (!contextMessage.file?.fileName) {
            continue
        }
        contextByFile.set(contextMessage.file.fileName, contextMessage)
    }

    return files.map((file: ContextFile): ContextItem => {
        const range = viewRangeToRange(file.range)
        const fallbackURI = legacyContextFileUri(file.fileName, range)
        const uri = file.uri || fallbackURI
        let text = file.content
        if (!text) {
            const contextMessage = contextByFile.get(file.fileName)
            if (contextMessage) {
                text = stripContextWrapper(contextMessage.text || '')
            }
        }
        return {
            uri,
            range,
            text: text || '',
            source: file.source,
        }
    })
}

function extractQuestion(input: string): string | undefined {
    input = input.trim()
    const q = input.indexOf('?')
    if (q !== -1) {
        return input.slice(0, q + 1).trim()
    }
    if (input.length < 100) {
        return input
    }
    return undefined
}

function isAbortError(error: Error): boolean {
    return error.message === 'aborted' || error.message === 'socket hang up'
}

function getContextWindowForModel(authStatus: AuthStatus, modelID: string): number {
    // In enterprise mode, we let the sg instance dictate the token limits and allow users to
    // overwrite it locally (for debugging purposes).
    //
    // This is similiar to the behavior we had before introducing the new chat and allows BYOK
    // customers to set a model of their choice without us having to map it to a known model on
    // the client.
    if (authStatus.endpoint && !isDotCom(authStatus.endpoint)) {
        const codyConfig = vscode.workspace.getConfiguration('cody')
        const tokenLimit = codyConfig.get<number>('provider.limit.prompt')
        if (tokenLimit) {
            return tokenLimit * 4 // bytes per token
        }

        if (authStatus.configOverwrites?.chatModelMaxTokens) {
            return authStatus.configOverwrites.chatModelMaxTokens * 4 // butes per token
        }

        return 28000 // 7000 tokens * 4 bytes per token
    }

    if (modelID.includes('openai/gpt-4-1106-preview')) {
        return 28000 // 7000 tokens * 4 bytes per token
    }
    if (modelID.endsWith('openai/gpt-3.5-turbo')) {
        return 10000 // 4,096 tokens * < 4 bytes per token
    }
    if (modelID.includes('mixtral-8x7b-instruct') && modelID.includes('fireworks')) {
        return 28000 // 7000 tokens * 4 bytes per token
    }
    return 28000 // assume default to Claude-2-like model
}

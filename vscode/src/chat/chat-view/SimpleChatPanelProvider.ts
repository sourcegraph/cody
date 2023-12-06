import * as path from 'path'

import * as uuid from 'uuid'
import * as vscode from 'vscode'

import { ActiveTextEditorSelectionRange, ChatMessage, ContextFile } from '@sourcegraph/cody-shared'
import { ChatModelProvider } from '@sourcegraph/cody-shared/src/chat-models'
import { ChatClient } from '@sourcegraph/cody-shared/src/chat/chat'
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
import { EmbeddingsSearch } from '@sourcegraph/cody-shared/src/embeddings'
import { FeatureFlag, FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { annotateAttribution, Guardrails } from '@sourcegraph/cody-shared/src/guardrails'
import { MAX_BYTES_PER_FILE, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateTextNearestLine } from '@sourcegraph/cody-shared/src/prompt/truncation'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { isError } from '@sourcegraph/cody-shared/src/utils'

import { View } from '../../../webviews/NavBar'
import { getFullConfig } from '../../configuration'
import { getFileContextFiles, getOpenTabsContextFile, getSymbolContextFiles } from '../../editor/utils/editor-context'
import { VSCodeEditor } from '../../editor/vscode-editor'
import { ContextStatusAggregator } from '../../local-context/enhanced-context-status'
import { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import { logDebug } from '../../log'
import { AuthProvider } from '../../services/AuthProvider'
import { getProcessInfo } from '../../services/LocalAppDetector'
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
import { MessageErrorType } from '../MessageProvider'
import { ConfigurationSubsetForWebview, LocalEnv, WebviewMessage } from '../protocol'
import { countGeneratedCode } from '../utils'

import { embeddingsUrlScheme, getChatPanelTitle, relativeFileUrl, stripContextWrapper } from './chat-helpers'
import { ChatHistoryManager } from './ChatHistoryManager'
import { addWebviewViewHTML, CodyChatPanelViewType } from './ChatManager'
import { ChatViewProviderWebview } from './ChatPanelProvider'
import { Config, IChatPanelProvider } from './ChatPanelsManager'
import { DefaultPrompter, IContextProvider, IPrompter } from './prompt'
import { ContextItem, MessageWithContext, SimpleChatModel, toViewMessage } from './SimpleChatModel'
import { SimpleChatRecipeAdapter } from './SimpleChatRecipeAdapter'

interface SimpleChatPanelProviderOptions {
    config: Config
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    guardrails: Guardrails
    chatClient: ChatClient
    embeddingsClient: EmbeddingsSearch | null
    localEmbeddings: LocalEmbeddingsController | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
    recipeAdapter: SimpleChatRecipeAdapter
    defaultModelID: string
}

export class SimpleChatPanelProvider implements vscode.Disposable, IChatPanelProvider {
    public webviewPanel?: vscode.WebviewPanel
    public webview?: ChatViewProviderWebview

    private chatModel: SimpleChatModel

    private extensionUri: vscode.Uri
    private disposables: vscode.Disposable[] = []

    private config: Config
    private readonly authProvider: AuthProvider
    private readonly guardrails: Guardrails
    private readonly chatClient: ChatClient
    private readonly embeddingsClient: EmbeddingsSearch | null
    private readonly localEmbeddings: LocalEmbeddingsController | null
    private readonly contextStatusAggregator = new ContextStatusAggregator()
    private readonly editor: VSCodeEditor
    private readonly treeView: TreeViewProvider
    private readonly defaultModelID: string

    private history = new ChatHistoryManager()
    private prompter: IPrompter = new DefaultPrompter()

    private contextFilesQueryCancellation?: vscode.CancellationTokenSource

    private readonly featureFlagProvider: FeatureFlagProvider

    // HACK: for now, we need awkwardly need to keep this in sync with chatModel.sessionID,
    // as it is necessary to satisfy the IChatPanelProvider interface.
    public sessionID: string

    private recipeAdapter: SimpleChatRecipeAdapter

    constructor({
        config,
        extensionUri,
        featureFlagProvider,
        authProvider,
        guardrails,
        chatClient,
        embeddingsClient,
        localEmbeddings,
        editor,
        treeView,
        defaultModelID,
        recipeAdapter,
    }: SimpleChatPanelProviderOptions) {
        this.config = config
        this.extensionUri = extensionUri
        this.featureFlagProvider = featureFlagProvider
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.localEmbeddings = localEmbeddings
        this.editor = editor
        this.treeView = treeView
        this.guardrails = guardrails
        this.recipeAdapter = recipeAdapter
        this.defaultModelID = defaultModelID

        this.chatModel = new SimpleChatModel(defaultModelID)
        this.sessionID = this.chatModel.sessionID

        // Advise local embeddings to start up if necessary.
        void this.localEmbeddings?.start()

        // Push context status to the webview when it changes.
        this.disposables.push(this.contextStatusAggregator.onDidChangeStatus(() => this.postContextStatusToWebView()))
        this.disposables.push(this.contextStatusAggregator)
        if (this.localEmbeddings) {
            this.disposables.push(this.contextStatusAggregator.addProvider(this.localEmbeddings))
        }
        if (this.embeddingsClient) {
            this.disposables.push(this.contextStatusAggregator.addProvider(this.embeddingsClient))
        }
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
        lastQuestion?: string
    ): Promise<vscode.WebviewPanel> {
        // Checks if the webview panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanel) {
            return this.webviewPanel
        }

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
        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'cody.png')

        // Reset the webview options to ensure localResourceRoots is up-to-date
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionUri, panel)

        // Register webview
        this.webviewPanel = panel
        this.webview = panel.webview
        this.postContextStatusToWebView()

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.cancelInProgressCompletion()
            this.webviewPanel = undefined
            this.webview = undefined
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
        void this.webview?.postMessage({
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

        await this.webview?.postMessage({
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
                // The web view is ready to receive events. We need to make sure that it has an up
                // to date config, even if it was already published
                await this.authProvider.announceNewAuthStatus()
                await this.postViewConfig()
                break
            case 'initialized':
                logDebug('SimpleChatPanelProvider:onDidReceiveMessage', 'initialized')
                await this.postChatModels()
                await this.restoreSession(this.sessionID)
                await this.postHistory()
                await this.postCodyCommands()
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
                await openFilePath(message.filePath, this.webviewPanel?.viewColumn, message.range)
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range)
                break
            case 'embeddings/index':
                void this.localEmbeddings?.index()
                break
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            default:
                this.postError(new Error('Invalid request type from Webview Panel'))
        }
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
        const oldTranscript = this.history.getChat(sessionID)
        if (!oldTranscript) {
            return
        }

        if (sessionID !== this.sessionID) {
            await this.saveSession()
        }
        this.cancelInProgressCompletion()
        const newModel = await newChatModelfromTranscriptJSON(oldTranscript, this.defaultModelID)
        this.chatModel = newModel
        this.sessionID = newModel.sessionID

        this.postViewTranscript()
    }

    public async saveSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }
        const allHistory = await this.history.saveChat(this.chatModel.toTranscriptJSON())
        void this.webview?.postMessage({
            type: 'history',
            messages: allHistory,
        })
        await this.treeView.updateTree(createCodyChatTreeItems())
    }

    public async clearAndRestartSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }
        await this.saveSession()
        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.sessionID = this.chatModel.sessionID
        this.postViewTranscript()
    }

    public clearChatHistory(): Promise<void> {
        // HACK: this is a no-op now. This exists only to satisfy the IChatPanelProvider interface
        // and can be removed once we retire the old ChatPanelProvider
        return Promise.resolve()
    }

    public triggerNotice(notice: { key: string }): void {
        void this.webview?.postMessage({
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

        void this.webview?.postMessage({
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
            return this.executeRecipe('custom-prompt', text.trim(), 'chat', userContextFiles, addEnhancedContext)
        }
        const displayText = userContextFiles?.length
            ? createDisplayTextWithFileLinks(userContextFiles, text)
            : createDisplayTextWithFileSelection(text, this.editor.getActiveTextEditorSelection())
        this.chatModel.addHumanMessage({ text }, displayText)
        // trigger the context progress indicator
        this.postViewTranscript({ speaker: 'assistant', text: '' })
        await this.generateAssistantResponse(requestID, userContextFiles, addEnhancedContext)
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
        }
        await this.webview?.postMessage({ type: 'config', config: configForWebview, authStatus })
        logDebug('SimpleChatPanelProvider', 'updateViewConfig', { verbose: configForWebview })
    }

    private async generateAssistantResponse(
        requestID: string,
        userContextFiles?: ContextFile[],
        addEnhancedContext = true
    ): Promise<void> {
        try {
            const contextWindowBytes = 28000 // 7000 tokens * 4 bytes per token

            const userContextItems = await contextFilesToContextItems(this.editor, userContextFiles || [], true)
            const contextProvider = new ContextProvider(
                userContextItems,
                this.editor,
                this.embeddingsClient,
                this.localEmbeddings
            )
            const { prompt, warnings, newContextUsed } = await this.prompter.makePrompt(
                this.chatModel,
                contextProvider,
                addEnhancedContext,
                contextWindowBytes
            )

            this.chatModel.setNewContextUsed(newContextUsed)

            if (warnings.length > 0) {
                const warningMsg =
                    'Warning: ' + warnings.map(w => (w.trim().endsWith('.') ? w.trim() : w.trim() + '.')).join(' ')
                this.postError(new Error(warningMsg))
            }

            this.postViewTranscript({ speaker: 'assistant', text: '' })

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
                    this.addBotMessageWithGuardrails(requestID, content)
                },
                error: (partialResponse, error) => {
                    if (isAbortError(error)) {
                        this.chatModel.addBotMessage({ text: partialResponse })
                    }
                    this.postError(error, 'transcript')
                    this.postViewTranscript()
                },
            })
        } catch (error) {
            this.postError(new Error(`Error generating assistant response: ${error}`))
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
                    typewriter.stop()
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
        void this.webview?.postMessage({
            type: 'transcript',
            messages,
            isMessageInProgress: !!messageInProgress,
            chatID: this.sessionID,
        })

        // Update webview panel title to match the last message
        const text = this.chatModel.getLastHumanMessages()?.displayText
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
            void this.webview?.postMessage({ type: 'transcript-errors', isTranscriptError: true })
            return
        }

        void this.webview?.postMessage({ type: 'errors', errors: error.message })
    }

    private async postHistory(humanInput?: string): Promise<void> {
        if (humanInput) {
            await this.history.saveHumanInputHistory(humanInput)
        }
        void this.webview?.postMessage({
            type: 'history',
            messages: this.history.localHistory,
        })
    }

    /**
     * Finalizes adding a bot message to the chat model, with guardrails, and triggers an
     * update to the view.
     */
    private addBotMessageWithGuardrails(requestID: string, rawResponse: string): void {
        this.guardrailsAnnotateAttributions(reformatBotMessageForChat(rawResponse, ''))
            .then(displayText => {
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
            })
            .catch(error => {
                throw error
            })
    }

    private async guardrailsAnnotateAttributions(text: string): Promise<string> {
        if (!this.config.experimentalGuardrails) {
            return text
        }

        const result = await annotateAttribution(this.guardrails, text)

        // Only log telemetry if we did work (ie had to annotate something).
        if (result.codeBlocks > 0) {
            telemetryService.log(
                'CodyVSCodeExtension:guardrails:annotate',
                {
                    codeBlocks: result.codeBlocks,
                    duration: result.duration,
                },
                { hasV2Event: true }
            )
            telemetryRecorder.recordEvent('cody.guardrails.annotate', 'executed', {
                // Convert nanoseconds to milliseconds to match other telemetry.
                metadata: { codeBlocks: result.codeBlocks, durationMs: result.duration / 1000000 },
            })
        }

        return result.text
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
            await this.clearAndRestartSession()
            const { humanMessage, prompt } = recipeMessages
            const displayText = this.editor.getActiveTextEditorSelection()
                ? createDisplayTextWithFileSelection(humanChatInput, this.editor.getActiveTextEditorSelection())
                : humanChatInput
            this.chatModel.addHumanMessage(humanMessage.message, displayText)
            if (humanMessage.newContextUsed) {
                this.chatModel.setNewContextUsed(humanMessage.newContextUsed)
            }
            this.postViewTranscript()

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
                    this.addBotMessageWithGuardrails(requestID, responseText)
                },
                error: (partialResponse: string, error: Error) => {
                    if (isAbortError(error)) {
                        this.chatModel.addBotMessage({ text: partialResponse })
                    }
                    this.postError(error, 'transcript')
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
            const prompts = (await this.editor.controllers.command?.getAllCommands(true)) || []
            void this.webview?.postMessage({
                type: 'custom-prompts',
                prompts,
            })
        }
        this.editor.controllers.command?.setMessenger(send)
        await send()
    }
}

class ContextProvider implements IContextProvider {
    constructor(
        private userContext: ContextItem[],
        private editor: Editor,
        private embeddingsClient: EmbeddingsSearch | null,
        private localEmbeddings: LocalEmbeddingsController | null
    ) {}

    public getExplicitContext(): ContextItem[] {
        return this.userContext
    }

    private getUserAttentionContext(): ContextItem[] {
        const selectionContext = this.getCurrentSelectionContext()
        if (selectionContext.length > 0) {
            return selectionContext
        }
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
        if (!visible) {
            return []
        }
        return [
            {
                text: visible.content,
                uri: visible.fileUri || vscode.Uri.file(visible.fileName),
            },
        ]
    }

    public async getEnhancedContext(text: string): Promise<ContextItem[]> {
        const searchContext: ContextItem[] = []
        let localEmbeddingsError
        let remoteEmbeddingsError

        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (start)')
        const localEmbeddingsResults = this.searchEmbeddingsLocal(text)
        const remoteEmbeddingsResults = this.searchEmbeddingsRemote(text)
        try {
            searchContext.push(...(await localEmbeddingsResults))
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > local embeddings', error)
            localEmbeddingsError = error
        }
        try {
            searchContext.push(...(await remoteEmbeddingsResults))
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > remote embeddings', error)
            remoteEmbeddingsError = error
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (end)')
        if (localEmbeddingsError && remoteEmbeddingsError) {
            throw new Error(
                `local and remote embeddings search failed (local: ${getErrorMessage(
                    localEmbeddingsError
                )}) (remote: ${getErrorMessage(remoteEmbeddingsError)})`
            )
        }

        const priorityContext: ContextItem[] = []
        if (this.needsUserAttentionContext(text)) {
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

    private async searchEmbeddingsLocal(text: string): Promise<ContextItem[]> {
        if (!this.localEmbeddings) {
            return []
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching local embeddings')
        const contextItems = []
        const embeddingsResults = await this.localEmbeddings.getContext(text, NUM_CODE_RESULTS + NUM_TEXT_RESULTS)
        for (const result of embeddingsResults) {
            const uri = vscode.Uri.from({
                scheme: 'file',
                path: result.fileName,
                fragment: `${result.startLine}:${result.endLine}`,
            })
            const range = new vscode.Range(
                new vscode.Position(result.startLine, 0),
                new vscode.Position(result.endLine, 0)
            )
            contextItems.push({
                uri,
                range,
                text: result.content,
            })
        }
        return contextItems
    }

    private async searchEmbeddingsRemote(text: string): Promise<ContextItem[]> {
        if (!this.embeddingsClient) {
            return []
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching remote embeddings')
        const contextItems = []
        const embeddings = await this.embeddingsClient.search(text, NUM_CODE_RESULTS, NUM_TEXT_RESULTS)
        if (isError(embeddings)) {
            throw new Error(`Error retrieving embeddings: ${embeddings}`)
        }
        for (const codeResult of embeddings.codeResults) {
            const uri = vscode.Uri.from({
                scheme: embeddingsUrlScheme,
                authority: this.embeddingsClient.repoId,
                path: '/' + codeResult.fileName,
                fragment: `L${codeResult.startLine}-${codeResult.endLine}`,
            })

            const range = new vscode.Range(
                new vscode.Position(codeResult.startLine, 0),
                new vscode.Position(codeResult.endLine, 0)
            )
            contextItems.push({
                uri,
                range,
                text: codeResult.content,
            })
        }

        for (const textResult of embeddings.textResults) {
            const uri = vscode.Uri.from({
                scheme: 'file',
                path: textResult.fileName,
                fragment: `${textResult.startLine}:${textResult.endLine}`,
            })
            const range = new vscode.Range(
                new vscode.Position(textResult.startLine, 0),
                new vscode.Position(textResult.endLine, 0)
            )
            contextItems.push({
                uri,
                range,
                text: textResult.content,
            })
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
        let readmeUri
        const patterns = ['README', 'README.*', 'Readme.*', 'readme.*']
        for (const pattern of patterns) {
            const files = await vscode.workspace.findFiles(pattern)
            if (files.length > 0) {
                readmeUri = files[0]
            }
        }
        if (!readmeUri) {
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
                readmeDisplayUri = relativeFileUrl(readmeRelPath)
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
            const uri = file.uri || vscode.Uri.file(file.fileName)
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

async function newChatModelfromTranscriptJSON(json: TranscriptJSON, defaultModelID: string): Promise<SimpleChatModel> {
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
    return new SimpleChatModel(json.chatModel || defaultModelID, (await Promise.all(messages)).flat(), json.id)
}

export function deserializedContextFilesToContextItems(
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
        const fallbackURI = relativeFileUrl(file.fileName, range)
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

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}

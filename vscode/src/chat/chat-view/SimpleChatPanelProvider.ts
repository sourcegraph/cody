import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    ChatModelProvider,
    ConfigFeaturesSingleton,
    ContextWindowLimitError,
    hydrateAfterPostMessage,
    isDefined,
    isDotCom,
    isError,
    isFileURI,
    isRateLimitError,
    reformatBotMessageForChat,
    Typewriter,
    type ChatClient,
    type ChatMessage,
    type CodyCommand,
    type ContextFile,
    type ContextMessage,
    type CustomCommandType,
    type Editor,
    type FeatureFlagProvider,
    type Guardrails,
    type InteractionJSON,
    type Message,
    type TranscriptJSON,
} from '@sourcegraph/cody-shared'

import type { View } from '../../../webviews/NavBar'
import { newCodyCommandArgs, type CodyCommandArgs } from '../../commands'
import type { CommandsController } from '../../commands/CommandsController'
import {
    createDisplayTextWithFileLinks,
    createDisplayTextWithFileSelection,
} from '../../commands/prompt/display-text'
import { getFullConfig } from '../../configuration'
import { executeEdit } from '../../edit/execute'
import {
    getFileContextFiles,
    getOpenTabsContextFile,
    getSymbolContextFiles,
} from '../../editor/utils/editor-context'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import { ContextStatusAggregator } from '../../local-context/enhanced-context-status'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import type { AuthProvider } from '../../services/AuthProvider'
import { getProcessInfo } from '../../services/LocalAppDetector'
import { localStorage } from '../../services/LocalStorageProvider'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { createCodyChatTreeItems } from '../../services/treeViewItems'
import type { TreeViewProvider } from '../../services/TreeViewProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { TestSupport } from '../../test-support'
import { countGeneratedCode } from '../utils'

import { getChatPanelTitle, openFile, stripContextWrapper, viewRangeToRange } from './chat-helpers'
import { ChatHistoryManager } from './ChatHistoryManager'
import { addWebviewViewHTML, CodyChatPanelViewType } from './ChatManager'
import type { ChatViewProviderWebview, Config } from './ChatPanelsManager'
import { CodebaseStatusProvider } from './CodebaseStatusProvider'
import { getCommandContext, getEnhancedContext } from './context'
import { InitDoer } from './InitDoer'
import {
    type ContextItem,
    type MessageWithContext,
    SimpleChatModel,
    toViewMessage,
} from './SimpleChatModel'
import type { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'
import type {
    AuthStatus,
    ChatSubmitType,
    ConfigurationSubsetForWebview,
    ExtensionMessage,
    LocalEnv,
    WebviewMessage,
} from '../protocol'
import { CommandPrompter, DefaultPrompter, type IPrompter } from './prompt'
import type { MessageErrorType } from '../MessageProvider'

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
    models: ChatModelProvider[]
    guardrails: Guardrails
    commandsController?: CommandsController
}

export interface ChatSession {
    webviewPanel?: vscode.WebviewPanel
    sessionID: string
}

export class SimpleChatPanelProvider implements vscode.Disposable, ChatSession {
    private chatModel: SimpleChatModel

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
    private readonly guardrails: Guardrails
    private readonly commandsController?: CommandsController

    private history = new ChatHistoryManager()
    private contextFilesQueryCancellation?: vscode.CancellationTokenSource

    // A unique identifier for this SimpleChatPanelProvider instance used to identify it to
    // container classes that need a handle to this specific panel provider.
    public get sessionID(): string {
        return this.chatModel.sessionID
    }

    constructor({
        config,
        extensionUri,
        authProvider,
        chatClient,
        embeddingsClient,
        localEmbeddings,
        symf,
        editor,
        treeView,
        models,
        commandsController,
        guardrails,
    }: SimpleChatPanelProviderOptions) {
        this.config = config
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.embeddingsClient = embeddingsClient
        this.localEmbeddings = localEmbeddings
        this.symf = symf
        this.commandsController = commandsController
        this.editor = editor
        this.treeView = treeView
        this.chatModel = new SimpleChatModel(selectModel(authProvider, models))
        this.guardrails = guardrails

        commandsController?.setEnableExperimentalCommands(config.internalUnstable)

        if (TestSupport.instance) {
            TestSupport.instance.chatPanelProvider.set(this)
        }

        // Advise local embeddings to start up if necessary.
        void this.localEmbeddings?.start()

        // Push context status to the webview when it changes.
        this.disposables.push(
            this.contextStatusAggregator.onDidChangeStatus(() => this.postContextStatusToWebView())
        )
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
            this.history.getChat(this.authProvider.getAuthStatus(), this.chatModel.sessionID)
                ?.chatTitle || getChatPanelTitle(lastQuestion)
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

        this.disposables.push(
            panel.webview.onDidReceiveMessage(message =>
                this.onDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            )
        )

        // Used for keeping sidebar chat view closed when webview panel is enabled
        await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, true)

        const configFeatures = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
        void this.postMessage({
            type: 'setChatEnabledConfigFeature',
            data: configFeatures.chat,
        })

        return panel
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
                await this.handleNewUserMessage(
                    requestID,
                    message.text,
                    message.submitType,
                    message.contextFiles ?? [],
                    message.addEnhancedContext ?? false
                )
                break
            }
            case 'edit': {
                const requestID = uuid.v4()
                await this.handleEdit(requestID, message.text)
                telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, {
                    hasV2Event: true,
                })
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
                this.postChatModels()
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
                await openFile(message.uri, message.range, this.webviewPanel?.viewColumn)
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range)
                break
            case 'embeddings/index':
                void this.localEmbeddings?.index()
                break
            case 'symf/index': {
                void this.codebaseStatusProvider.currentCodebase().then((codebase): void => {
                    if (codebase && isFileURI(codebase.localFolder)) {
                        void this.symf?.ensureIndex(codebase.localFolder, { hard: true })
                    }
                })
                break
            }
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            case 'attribution-search':
                this.guardrails
                    .searchAttribution(message.snippet)
                    .then((attribution): void => {
                        if (isError(attribution)) {
                            void this.postMessage({
                                type: 'attribution',
                                snippet: message.snippet,
                                error: attribution.message,
                            })
                            return
                        }
                        void this.postMessage({
                            type: 'attribution',
                            snippet: message.snippet,
                            attribution: {
                                repositoryNames: attribution.repositories.map(r => r.name),
                                limitHit: attribution.limitHit,
                            },
                        })
                    })
                    .catch(error => {
                        void this.postMessage({
                            type: 'attribution',
                            snippet: message.snippet,
                            error: `${error}`,
                        })
                    })

                break
            default:
                this.postError(new Error(`Invalid request type from Webview Panel: ${message.command}`))
        }
    }

    private initDoer = new InitDoer<boolean | undefined>()
    private async onInitialized(): Promise<void> {
        // HACK: this call is necessary to get the webview to set the chatID state,
        // which is necessary on deserialization. It should be invoked before the
        // other initializers run (otherwise, it might interfere with other view
        // state)
        await this.webview?.postMessage({
            type: 'transcript',
            messages: [],
            isMessageInProgress: false,
            chatID: this.chatModel.sessionID,
        })

        this.postChatModels()
        await this.saveSession()
        await this.postCodyCommands()
        this.initDoer.signalInitialized()
    }

    private disposables: vscode.Disposable[] = []
    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
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
        this.postViewTranscript()
        // Reset current chat panel title
        this.handleChatTitle('New Chat')
    }

    /**
     * Handles setting the chat title.
     *
     * Sets the title to the given string. Once set, the title will not update
     * automatically to the next question.
     * This allows users to manually edit the title for each chat session (via sidebar).
     */
    public handleChatTitle(title: string): void {
        // Skip storing default chat title
        if (title !== 'New Chat') {
            this.chatModel.setChatTitle(title)
        }
        if (this.webviewPanel) {
            this.webviewPanel.title = title
        }
    }

    private postChatModels(): void {
        const authStatus = this.authProvider.getAuthStatus()
        if (!authStatus?.isLoggedIn) {
            return
        }
        if (authStatus?.configOverwrites?.chatModel) {
            ChatModelProvider.add(new ChatModelProvider(authStatus.configOverwrites.chatModel))
        }
        const models = ChatModelProvider.get(authStatus.endpoint, this.chatModel.modelID)

        void this.postMessage({
            type: 'chatModels',
            models,
        })
    }

    public async handleCommand(command: CodyCommand, args: CodyCommandArgs): Promise<void> {
        // If it's not an ask command, it's a fixup command, so we can exit early.
        // This is because startCommand will start the CommandRunner,
        // which would send all fixup command requests to the FixupController
        if (command.mode !== 'ask') {
            return
        }

        if (!this.editor.getActiveTextEditorSelectionOrVisibleContent()) {
            if (
                command.context?.selection ||
                command.context?.currentFile ||
                command.context?.currentDir
            ) {
                return this.postError(
                    new Error('Command failed. Please open a file and try again.'),
                    'transcript'
                )
            }
        }

        const inputText = [command.slashCommand, command.additionalInput].join(' ')?.trim()
        const displayText = createDisplayTextWithFileSelection(
            inputText,
            this.editor.getActiveTextEditorSelectionOrEntireFile()
        )
        const promptText = command.prompt
        this.chatModel.addHumanMessage({ text: promptText }, displayText)
        this.updateWebviewPanelTitle(inputText)
        await this.saveSession(inputText)

        // trigger the context progress indicator
        this.postViewTranscript({ speaker: 'assistant' })

        const prompt = await this.buildPrompt(
            new CommandPrompter(() => getCommandContext(this.editor, command))
        )
        this.streamAssistantResponse(args.requestID, prompt)
    }

    public async handleNewUserMessage(
        requestID: string,
        inputText: string,
        submitType: ChatSubmitType,
        userContextFiles: ContextFile[],
        addEnhancedContext: boolean
    ): Promise<void> {
        // DEPRECATED (remove after slash commands are removed)
        // If this is a slash command, run it with custom command instead
        if (inputText.startsWith('/')) {
            if (inputText.match(/^\/r(eset)?$/)) {
                return this.clearAndRestartSession()
            }
            if (inputText.match(/^\/edit(\s)?/)) {
                return executeEdit({ instruction: inputText.replace(/^\/(edit)/, '').trim() }, 'chat')
            }
            if (inputText === '/commands-settings') {
                // User has clicked the settings button for commands
                return vscode.commands.executeCommand('cody.settings.commands')
            }
            const commandArgs = newCodyCommandArgs({ source: 'chat', requestID })
            const command = await this.commandsController?.startCommand(inputText, commandArgs)
            if (command) {
                return this.handleCommand(command, commandArgs)
            }
        }

        if (submitType === 'user-newchat' && !this.chatModel.isEmpty()) {
            await this.clearAndRestartSession()
        }

        const displayText = userContextFiles?.length
            ? createDisplayTextWithFileLinks(inputText, userContextFiles)
            : inputText
        const promptText = inputText
        this.chatModel.addHumanMessage({ text: promptText }, displayText)
        this.updateWebviewPanelTitle(inputText)
        await this.saveSession(inputText)

        // trigger the context progress indicator
        this.postViewTranscript({ speaker: 'assistant' })

        const userContextItems = await contextFilesToContextItems(
            this.editor,
            userContextFiles || [],
            true
        )
        const prompter = new DefaultPrompter(
            userContextItems,
            addEnhancedContext
                ? query =>
                      getEnhancedContext(
                          this.config.useContext,
                          this.editor,
                          this.embeddingsClient,
                          this.localEmbeddings,
                          this.config.experimentalSymfContext ? this.symf : null,
                          this.codebaseStatusProvider,
                          query
                      )
                : undefined
        )
        const sendTelemetry = (contextSummary: any): void => {
            const authStatus = this.authProvider.getAuthStatus()
            const properties = {
                requestID,
                chatModel: this.chatModel.modelID,
                contextSummary,
            }

            telemetryService.log('CodyVSCodeExtension:chat-question:executed', properties, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.chat-question', 'executed', {
                metadata: {
                    ...contextSummary,
                    // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                    // See https://github.com/sourcegraph/sourcegraph/pull/59524
                    recordsPrivateMetadataTranscript:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? 1 : 0,
                },
                privateMetadata: {
                    properties,
                    // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an aditional safeguard measure
                    promptText:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? promptText : undefined,
                },
            })
        }

        try {
            const prompt = await this.buildPrompt(prompter, sendTelemetry)
            this.streamAssistantResponse(requestID, prompt)
        } catch (error) {
            if (isRateLimitError(error)) {
                this.postError(error, 'transcript')
            } else {
                this.postError(
                    isError(error) ? error : new Error(`Error generating assistant response: ${error}`)
                )
            }
        }
    }

    /**
     * Constructs the prompt and updates the UI with the context used in the prompt.
     */
    private async buildPrompt(
        prompter: IPrompter,
        sendTelemetry?: (contextSummary: any) => void
    ): Promise<Message[]> {
        const { prompt, contextLimitWarnings, newContextUsed } = await prompter.makePrompt(
            this.chatModel,
            getContextWindowForModel(this.authProvider.getAuthStatus(), this.chatModel.modelID)
        )

        // Update UI based on prompt construction
        this.chatModel.setNewContextUsed(newContextUsed)
        if (contextLimitWarnings.length > 0) {
            const warningMsg = contextLimitWarnings
                .map(w => {
                    w = w.trim()
                    if (!w.endsWith('.')) {
                        w += '.'
                    }
                    return w
                })
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

        return prompt
    }

    private streamAssistantResponse(requestID: string, prompt: Message[]): void {
        this.postViewTranscript({ speaker: 'assistant' })

        this.sendLLMRequest(prompt, {
            update: content => {
                this.postViewTranscript(
                    toViewMessage({
                        message: {
                            speaker: 'assistant',
                            text: content,
                        },
                    })
                )
            },
            close: content => {
                this.addBotMessage(requestID, content)
            },
            error: (partialResponse, error) => {
                if (!isAbortError(error)) {
                    this.postError(error, 'transcript')
                }
                try {
                    // We should still add the partial response if there was an error
                    // This'd throw an error if one has already been added
                    this.addBotMessage(requestID, partialResponse)
                } catch {
                    console.error('Streaming Error', error)
                }
            },
        })
    }

    private async handleEdit(requestID: string, text: string): Promise<void> {
        this.chatModel.updateLastHumanMessage({ text })
        this.postViewTranscript()

        const prompter = new DefaultPrompter(
            [], // TODO(beyang): support user context items in the edit input
            (
                query // TODO(beyang): get useEnhancedContext
            ) =>
                getEnhancedContext(
                    this.config.useContext,
                    this.editor,
                    this.embeddingsClient,
                    this.localEmbeddings,
                    this.config.experimentalSymfContext ? this.symf : null,
                    this.codebaseStatusProvider,
                    query
                )
        )

        try {
            const prompt = await this.buildPrompt(prompter)
            this.streamAssistantResponse(requestID, prompt)
        } catch (error) {
            if (isRateLimitError(error)) {
                this.postError(error, 'transcript')
            } else {
                this.postError(
                    isError(error) ? error : new Error(`Error generating assistant response: ${error}`)
                )
            }
        }
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
        const workspaceFolderUris =
            vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? []
        await this.postMessage({
            type: 'config',
            config: configForWebview,
            authStatus,
            workspaceFolderUris,
        })
        logDebug('SimpleChatPanelProvider', 'updateViewConfig', { verbose: configForWebview })
    }

    /**
     * Issue the chat request and stream the results back, updating the model and view
     * with the response.
     */
    private async sendLLMRequest(
        prompt: Message[],
        callbacks: {
            update: (response: string) => void
            close: (finalResponse: string) => void
            error: (completedResponse: string, error: Error) => void
        }
    ): Promise<void> {
        let lastContent = ''
        const typewriter = new Typewriter({
            update: content => {
                lastContent = content
                callbacks.update(content)
            },
            close: () => {
                callbacks.close(lastContent)
            },
            error: error => {
                callbacks.error(lastContent, error)
            },
        })

        this.cancelInProgressCompletion()
        const abortController = new AbortController()
        this.completionCanceller = () => abortController.abort()
        const stream = this.chatClient.chat(
            prompt,
            { model: this.chatModel.modelID },
            abortController.signal
        )

        for await (const message of stream) {
            switch (message.type) {
                case 'change': {
                    typewriter.update(message.text)
                    break
                }
                case 'complete': {
                    this.completionCanceller = undefined
                    typewriter.close()
                    typewriter.stop()
                    break
                }
                case 'error': {
                    this.cancelInProgressCompletion()
                    typewriter.close()
                    typewriter.stop(message.error)
                }
            }
        }
    }
    private completionCanceller?: () => void
    private cancelInProgressCompletion(): void {
        if (this.completionCanceller) {
            this.completionCanceller()
            this.completionCanceller = undefined
        }
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
        const messages: ChatMessage[] = this.chatModel
            .getMessagesWithContext()
            .map(m => toViewMessage(m))
        if (messageInProgress) {
            messages.push(messageInProgress)
        }

        // We never await on postMessage, because it can sometimes hang indefinitely:
        // https://github.com/microsoft/vscode/issues/159431
        void this.postMessage({
            type: 'transcript',
            messages,
            isMessageInProgress: !!messageInProgress,
            chatID: this.chatModel.sessionID,
        })

        const chatTitle = this.history.getChat(
            this.authProvider.getAuthStatus(),
            this.chatModel.sessionID
        )?.chatTitle
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
        logDebug('SimpleChatPanelProvider: postError', error.message)
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

        const authStatus = this.authProvider.getAuthStatus()

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
                    // Flag indicating this is a transcript event to go through ML data pipeline. Only for dotcom users
                    // See https://github.com/sourcegraph/sourcegraph/pull/59524
                    recordsPrivateMetadataTranscript:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? 1 : 0,
                },
                privateMetadata: {
                    requestID,
                    // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an aditional safegaurd measure
                    responseText:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? rawResponse : undefined,
                },
            })
        }
    }

    public async executeCustomCommand(title: string, type?: CustomCommandType): Promise<void> {
        const customPromptActions = ['add', 'get', 'menu']
        if (customPromptActions.includes(title)) {
            title = title.trim()
            switch (title) {
                case 'menu':
                    await this.commandsController?.menu('custom')
                    break
                case 'add':
                    if (!type) {
                        break
                    }
                    await this.commandsController?.configFileAction('add', type)
                    telemetryService.log('CodyVSCodeExtension:addCommandButton:clicked', undefined, {
                        hasV2Event: true,
                    })
                    telemetryRecorder.recordEvent('cody.addCommandButton', 'clicked')
                    break
            }
            await this.postCodyCommands()
            return
        }

        await vscode.commands.executeCommand('cody.action.commands.exec', title)
    }

    /**
     * Send a list of commands to webview that can be triggered via chat input box with slash
     */
    private async postCodyCommands(): Promise<void> {
        const send = async (): Promise<void> => {
            await this.commandsController?.refresh()
            const allCommands = await this.commandsController?.getAllCommands(true)
            // HACK: filter out commands that make inline changes and /ask (synonymous with a generic question)
            const prompts =
                allCommands?.filter(([id, { mode }]) => {
                    /** The /ask command is only useful outside of chat */
                    const isRedundantCommand = id === '/ask'
                    return !isRedundantCommand
                }) || []
            void this.postMessage({
                type: 'custom-prompts',
                prompts,
            })
        }
        this.commandsController?.setMessenger(send)
        await send()
    }

    /**
     * Webview state
     */
    private extensionUri: vscode.Uri
    private _webviewPanel?: vscode.WebviewPanel
    public get webviewPanel(): vscode.WebviewPanel | undefined {
        return this._webviewPanel
    }
    private _webview?: ChatViewProviderWebview
    public get webview(): ChatViewProviderWebview | undefined {
        return this._webview
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

    private updateWebviewPanelTitle(title: string): void {
        if (this.webviewPanel) {
            this.webviewPanel.title =
                this.history.getChat(this.authProvider.getAuthStatus(), this.chatModel.sessionID)
                    ?.chatTitle || getChatPanelTitle(title)
        }
    }

    public transcriptForTesting(testing: TestSupport): ChatMessage[] {
        if (!testing) {
            console.error('used ForTesting method without test support object')
            return []
        }
        const messages: ChatMessage[] = this.chatModel
            .getMessagesWithContext()
            .map(m => toViewMessage(m))
        return messages
    }
}

async function newChatModelfromTranscriptJSON(
    json: TranscriptJSON,
    modelID: string
): Promise<SimpleChatModel> {
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
    return new SimpleChatModel(
        json.chatModel || modelID,
        (await Promise.all(messages)).flat(),
        json.id,
        json.chatTitle
    )
}

export async function contextFilesToContextItems(
    editor: Editor,
    files: ContextFile[],
    fetchContent?: boolean
): Promise<ContextItem[]> {
    return (
        await Promise.all(
            files.map(async (file: ContextFile): Promise<ContextItem | null> => {
                const range = viewRangeToRange(file.range)
                let text = file.content
                if (!text && fetchContent) {
                    try {
                        text = await editor.getTextEditorContentForFile(file.uri, range)
                    } catch (error) {
                        void vscode.window.showErrorMessage(
                            `Cody could not include context from ${file.uri}. (Reason: ${error})`
                        )
                        return null
                    }
                }
                return {
                    uri: file.uri,
                    range,
                    text: text || '',
                    source: file.source,
                }
            })
        )
    ).filter(isDefined)
}

function deserializedContextFilesToContextItems(
    files: ContextFile[],
    contextMessages: ContextMessage[]
): ContextItem[] {
    const contextByFile = new Map<string /* uri.toString() */, ContextMessage>()
    for (const contextMessage of contextMessages) {
        if (!contextMessage.file) {
            continue
        }
        contextByFile.set(contextMessage.file.uri.toString(), contextMessage)
    }

    return files.map((file: ContextFile): ContextItem => {
        const range = viewRangeToRange(file.range)
        let text = file.content
        if (!text) {
            const contextMessage = contextByFile.get(file.uri.toString())
            if (contextMessage) {
                text = stripContextWrapper(contextMessage.text || '')
            }
        }
        return {
            uri: file.uri,
            range,
            text: text || '',
            source: file.source,
        }
    })
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

// Select the chat model to use in Chat
function selectModel(authProvider: AuthProvider, models: ChatModelProvider[]): string {
    const authStatus = authProvider.getAuthStatus()
    // Free user can only use the default model
    if (authStatus.isDotCom && authStatus.userCanUpgrade) {
        return models[0].model
    }
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

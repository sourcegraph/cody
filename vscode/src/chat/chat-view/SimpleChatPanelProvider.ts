import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type ChatClient,
    type ChatEventSource,
    type ChatInputHistory,
    type ChatMessage,
    ConfigFeaturesSingleton,
    type ContextItem,
    type ContextMessage,
    type Editor,
    FeatureFlag,
    type FeatureFlagProvider,
    type Guardrails,
    type InteractionJSON,
    type Message,
    ModelProvider,
    type TranscriptJSON,
    Typewriter,
    featureFlagProvider,
    hydrateAfterPostMessage,
    isDefined,
    isDotCom,
    isError,
    isFileURI,
    isRateLimitError,
    reformatBotMessageForChat,
} from '@sourcegraph/cody-shared'

import type { View } from '../../../webviews/NavBar'
import { createDisplayTextWithFileLinks } from '../../commands/utils/display-text'
import { getFullConfig } from '../../configuration'
import { type RemoteSearch, RepoInclusion } from '../../context/remote-search'
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
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import type { TreeViewProvider } from '../../services/tree-views/TreeViewProvider'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { TestSupport } from '../../test-support'
import { countGeneratedCode } from '../utils'

import type { Span } from '@opentelemetry/api'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { recordErrorToSpan, tracer } from '@sourcegraph/cody-shared/src/tracing'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import type { Repo } from '../../context/repo-fetcher'
import type { RemoteRepoPicker } from '../../context/repo-picker'
import type { ContextRankingController } from '../../local-context/context-ranking'
import { chatModel } from '../../models'
import { getContextWindowForModel } from '../../models/utilts'
import { recordExposedExperimentsToSpan } from '../../services/open-telemetry/utils'
import type { MessageErrorType } from '../MessageProvider'
import type {
    ChatSubmitType,
    ConfigurationSubsetForWebview,
    ExtensionMessage,
    LocalEnv,
    WebviewMessage,
} from '../protocol'
import { ChatHistoryManager } from './ChatHistoryManager'
import { CodyChatPanelViewType, addWebviewViewHTML } from './ChatManager'
import type { ChatPanelConfig, ChatViewProviderWebview } from './ChatPanelsManager'
import { CodebaseStatusProvider } from './CodebaseStatusProvider'
import { InitDoer } from './InitDoer'
import { type MessageWithContext, SimpleChatModel, toViewMessage } from './SimpleChatModel'
import { getChatPanelTitle, openFile, stripContextWrapper, viewRangeToRange } from './chat-helpers'
import { getEnhancedContext } from './context'
import { DefaultPrompter, type IPrompter } from './prompt'

interface SimpleChatPanelProviderOptions {
    config: ChatPanelConfig
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient
    localEmbeddings: LocalEmbeddingsController | null
    contextRanking: ContextRankingController | null
    symf: SymfRunner | null
    enterpriseContext: EnterpriseContextFactory | null
    editor: VSCodeEditor
    treeView: TreeViewProvider
    featureFlagProvider: FeatureFlagProvider
    models: ModelProvider[]
    guardrails: Guardrails
}

export interface ChatSession {
    webviewPanel?: vscode.WebviewPanel
    sessionID: string
}
/**
 * SimpleChatPanelProvider is the view controller class for the chat panel.
 * It handles all events sent from the view, keeps track of the underlying chat model,
 * and interacts with the rest of the extension.
 *
 * Its methods are grouped into the following sections, each of which is demarcated
 * by a comment block (search for "// #region "):
 *
 * 1. top-level view action handlers
 * 2. view updaters
 * 3. chat request lifecycle methods
 * 4. session management
 * 5. webview container management
 * 6. other public accessors and mutators
 *
 * The following invariants should be maintained:
 * 1. top-level view action handlers
 *    a. should all follow the handle$ACTION naming convention
 *    b. should be private (with the existing exceptions)
 * 2. view updaters
 *    a. should all follow the post$ACTION naming convention
 *    b. should NOT mutate model state
 * 3. Keep the public interface of this class small in order to
 *    avoid tight coupling with other classes. If communication
 *    with other components outside the model and view is needed,
 *    use a broadcast/subscription design.
 */
export class SimpleChatPanelProvider implements vscode.Disposable, ChatSession {
    private chatModel: SimpleChatModel

    private config: ChatPanelConfig
    private readonly authProvider: AuthProvider
    private readonly chatClient: ChatClient
    private readonly codebaseStatusProvider: CodebaseStatusProvider
    private readonly localEmbeddings: LocalEmbeddingsController | null
    private readonly contextRanking: ContextRankingController | null
    private readonly symf: SymfRunner | null
    private readonly contextStatusAggregator = new ContextStatusAggregator()
    private readonly editor: VSCodeEditor
    private readonly treeView: TreeViewProvider
    private readonly guardrails: Guardrails
    private readonly remoteSearch: RemoteSearch | null
    private readonly repoPicker: RemoteRepoPicker | null

    private history = new ChatHistoryManager()
    private contextFilesQueryCancellation?: vscode.CancellationTokenSource

    private disposables: vscode.Disposable[] = []
    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.disposables = []
    }

    constructor({
        config,
        extensionUri,
        authProvider,
        chatClient,
        localEmbeddings,
        contextRanking,
        symf,
        editor,
        treeView,
        models,
        guardrails,
        enterpriseContext,
    }: SimpleChatPanelProviderOptions) {
        this.config = config
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.localEmbeddings = localEmbeddings
        this.contextRanking = contextRanking
        this.symf = symf
        this.repoPicker = enterpriseContext?.repoPicker || null
        this.remoteSearch = enterpriseContext?.createRemoteSearch() || null
        this.editor = editor
        this.treeView = treeView
        this.chatModel = new SimpleChatModel(chatModel.get(authProvider, models))
        this.guardrails = guardrails

        if (TestSupport.instance) {
            TestSupport.instance.chatPanelProvider.set(this)
        }

        // Advise local embeddings to start up if necessary.
        void this.localEmbeddings?.start()

        // Start the context Ranking module
        void this.contextRanking?.start()

        // Push context status to the webview when it changes.
        this.disposables.push(
            this.contextStatusAggregator.onDidChangeStatus(() => this.postContextStatus())
        )
        this.disposables.push(this.contextStatusAggregator)
        if (this.localEmbeddings) {
            this.disposables.push(this.contextStatusAggregator.addProvider(this.localEmbeddings))
        }
        this.codebaseStatusProvider = new CodebaseStatusProvider(
            this.editor,
            this.config.experimentalSymfContext ? this.symf : null,
            enterpriseContext ? enterpriseContext.getCodebaseRepoIdMapper() : null
        )
        this.disposables.push(this.contextStatusAggregator.addProvider(this.codebaseStatusProvider))

        if (this.remoteSearch) {
            this.disposables.push(
                // Display enhanced context status from the remote search provider
                this.contextStatusAggregator.addProvider(this.remoteSearch),

                // When the codebase has a remote ID, include it automatically
                this.codebaseStatusProvider.onDidChangeStatus(async () => {
                    const codebase = await this.codebaseStatusProvider.currentCodebase()
                    if (codebase?.remote && codebase.remoteRepoId) {
                        this.remoteSearch?.setRepos(
                            [
                                {
                                    name: codebase.remote,
                                    id: codebase.remoteRepoId,
                                },
                            ],
                            RepoInclusion.Automatic
                        )
                    }
                })
            )
        }
    }

    /**
     * onDidReceiveMessage handles all user actions sent from the chat panel view.
     * @param message is the message from the view.
     */
    private async onDidReceiveMessage(message: WebviewMessage): Promise<void> {
        switch (message.command) {
            case 'ready':
                await this.handleReady()
                break
            case 'initialized':
                await this.handleInitialized()
                break
            case 'submit': {
                await this.handleUserMessageSubmission(
                    uuid.v4(),
                    message.text,
                    message.submitType,
                    message.contextFiles ?? [],
                    message.addEnhancedContext ?? false,
                    'chat'
                )
                break
            }
            case 'edit': {
                await this.handleEdit(
                    uuid.v4(),
                    message.text,
                    message.index,
                    message.contextFiles ?? [],
                    message.addEnhancedContext || false
                )
                break
            }
            case 'abort':
                this.handleAbort()
                break
            case 'chatModel':
                this.handleSetChatModel(message.model)
                break
            case 'get-chat-models':
                this.postChatModels()
                break
            case 'getUserContext':
                await this.handleGetUserContextFilesCandidates(message.query)
                break
            case 'insert':
                await handleCodeFromInsertAtCursor(message.text, message.metadata)
                break
            case 'copy':
                await handleCopiedCode(message.text, message.eventType === 'Button', message.metadata)
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
            case 'newFile':
                handleCodeFromSaveToNewFile(message.text, message.metadata)
                await this.editor.createWorkspaceFile(message.text)
                break
            case 'context/get-remote-search-repos': {
                await this.postMessage({
                    type: 'context/remote-repos',
                    repos: this.chatModel.getSelectedRepos() ?? [],
                })
                break
            }
            case 'context/choose-remote-search-repo': {
                await this.handleChooseRemoteSearchRepo(message.explicitRepos)
                break
            }
            case 'context/remove-remote-search-repo':
                void this.handleRemoveRemoteSearchRepo(message.repoId)
                break
            case 'embeddings/index':
                void this.localEmbeddings?.index()
                break
            case 'symf/index': {
                void this.handleSymfIndex()
                break
            }
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            case 'attribution-search':
                await this.handleAttributionSearch(message.snippet)
                break
            case 'restoreHistory':
                await this.restoreSession(message.chatID)
                break
            case 'reset':
                await this.clearAndRestartSession()
                break
            case 'event':
                telemetryService.log(message.eventName, message.properties)
                break
            default:
                this.postError(new Error(`Invalid request type from Webview Panel: ${message.command}`))
        }
    }

    // =======================================================================
    // #region top-level view action handlers
    // =======================================================================

    // When the webview sends the 'ready' message, respond by posting the view config
    private async handleReady(): Promise<void> {
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
        logDebug('SimpleChatPanelProvider', 'updateViewConfig', {
            verbose: configForWebview,
        })
    }

    private initDoer = new InitDoer<boolean | undefined>()
    private async handleInitialized(): Promise<void> {
        logDebug('SimpleChatPanelProvider', 'handleInitialized')
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
        this.initDoer.signalInitialized()
    }

    /**
     * Handles user input text for both new and edit submissions
     */
    public async handleUserMessageSubmission(
        requestID: string,
        inputText: string,
        submitType: ChatSubmitType,
        userContextFiles: ContextItem[],
        addEnhancedContext: boolean,
        source?: ChatEventSource
    ): Promise<void> {
        return tracer.startActiveSpan('chat.submit', async (span): Promise<void> => {
            const useFusedContextPromise = featureFlagProvider.evaluateFeatureFlag(
                FeatureFlag.CodyChatFusedContext
            )

            const authStatus = this.authProvider.getAuthStatus()
            const sharedProperties = {
                requestID,
                chatModel: this.chatModel.modelID,
                source,
                traceId: span.spanContext().traceId,
            }
            telemetryService.log('CodyVSCodeExtension:chat-question:submitted', sharedProperties)
            telemetryRecorder.recordEvent('cody.chat-question', 'submitted', {
                metadata: {
                    // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                    // See https://github.com/sourcegraph/sourcegraph/pull/59524
                    recordsPrivateMetadataTranscript:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? 1 : 0,
                },
                privateMetadata: {
                    ...sharedProperties,
                    // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                    // V2 telemetry exports privateMetadata only for DotCom users
                    // the condition below is an additional safeguard measure
                    promptText:
                        authStatus.endpoint && isDotCom(authStatus.endpoint) ? inputText : undefined,
                },
            })

            tracer.startActiveSpan('chat.submit.firstToken', async (firstTokenSpan): Promise<void> => {
                span.setAttribute('sampled', true)

                if (inputText.match(/^\/reset$/)) {
                    span.addEvent('clearAndRestartSession')
                    span.end()
                    return this.clearAndRestartSession()
                }

                if (submitType === 'user-newchat' && !this.chatModel.isEmpty()) {
                    span.addEvent('clearAndRestartSession')
                    await this.clearAndRestartSession()
                }

                const displayText = userContextFiles?.length
                    ? createDisplayTextWithFileLinks(inputText, userContextFiles)
                    : inputText
                const promptText = inputText
                this.chatModel.addHumanMessage({ text: promptText }, displayText)
                await this.saveSession({ inputText, inputContextFiles: userContextFiles })

                this.postEmptyMessageInProgress()

                const userContextItems = await contextFilesToContextItems(
                    this.editor,
                    userContextFiles || [],
                    true
                )
                span.setAttribute('strategy', this.config.useContext)
                const prompter = new DefaultPrompter(
                    userContextItems,
                    addEnhancedContext
                        ? async (text, maxChars) =>
                              getEnhancedContext({
                                  strategy: this.config.useContext,
                                  editor: this.editor,
                                  text,
                                  providers: {
                                      localEmbeddings: this.localEmbeddings,
                                      symf: this.config.experimentalSymfContext ? this.symf : null,
                                      remoteSearch: this.remoteSearch,
                                  },
                                  featureFlags: {
                                      fusedContext:
                                          this.config.internalUnstable || (await useFusedContextPromise),
                                  },
                                  hints: { maxChars },
                                  contextRanking: this.contextRanking,
                              })
                        : undefined
                )
                const sendTelemetry = (contextSummary: any): void => {
                    const properties = {
                        ...sharedProperties,
                        contextSummary,
                        traceId: span.spanContext().traceId,
                    }
                    span.setAttributes(properties)

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
                            // the condition below is an additional safeguard measure
                            promptText:
                                authStatus.endpoint && isDotCom(authStatus.endpoint)
                                    ? promptText
                                    : undefined,
                        },
                    })
                }

                try {
                    const prompt = await this.buildPrompt(prompter, sendTelemetry)
                    this.streamAssistantResponse(requestID, prompt, span, firstTokenSpan)
                } catch (error) {
                    if (isRateLimitError(error)) {
                        this.postError(error, 'transcript')
                    } else {
                        this.postError(
                            isError(error)
                                ? error
                                : new Error(`Error generating assistant response: ${error}`)
                        )
                    }
                    recordErrorToSpan(span, error as Error)
                }
            })
        })
    }

    /**
     * Handles editing a human chat message in current chat session.
     *
     * Removes any existing messages from the provided index,
     * before submitting the replacement text as a new question.
     * When no index is provided, default to the last human message.
     */
    private async handleEdit(
        requestID: string,
        text: string,
        index?: number,
        contextFiles: ContextItem[] = [],
        addEnhancedContext = true
    ): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:editChatButton:clicked', undefined, {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.editChatButton', 'clicked')

        try {
            const humanMessage = index ?? this.chatModel.getLastSpeakerMessageIndex('human')
            if (humanMessage === undefined) {
                return
            }
            this.chatModel.removeMessagesFromIndex(humanMessage, 'human')
            return await this.handleUserMessageSubmission(
                requestID,
                text,
                'user',
                contextFiles,
                addEnhancedContext
            )
        } catch {
            this.postError(new Error('Failed to edit prompt'), 'transcript')
        }
    }

    private handleAbort(): void {
        this.cancelInProgressCompletion()
        telemetryService.log(
            'CodyVSCodeExtension:abortButton:clicked',
            { source: 'sidebar' },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
    }

    private async handleSetChatModel(modelID: string): Promise<void> {
        this.chatModel.modelID = modelID
        await chatModel.set(modelID)
    }

    private async handleGetUserContextFilesCandidates(query: string): Promise<void> {
        const source = 'chat'
        if (!query.length) {
            telemetryService.log('CodyVSCodeExtension:at-mention:executed', { source })
            telemetryRecorder.recordEvent('cody.at-mention', 'executed', { privateMetadata: { source } })

            const tabs = await getOpenTabsContextFile()
            void this.postMessage({
                type: 'userContextFiles',
                userContextFiles: tabs,
            })
            return
        }

        // Log when query only has 1 char to avoid logging the same query repeatedly
        if (query.length === 1) {
            const type = query.startsWith('#') ? 'symbol' : 'file'
            telemetryService.log(`CodyVSCodeExtension:at-mention:${type}:executed`, { source })
            telemetryRecorder.recordEvent(`cody.at-mention.${type}`, 'executed', {
                privateMetadata: { source },
            })
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
                        userContextFiles: symbolResults,
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
                        userContextFiles: fileResults,
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

    private async handleSymfIndex(): Promise<void> {
        const codebase = await this.codebaseStatusProvider.currentCodebase()
        if (codebase && isFileURI(codebase.localFolder)) {
            await this.symf?.ensureIndex(codebase.localFolder, {
                retryIfLastAttemptFailed: true,
                ignoreExisting: false,
            })
        }
    }

    private async handleAttributionSearch(snippet: string): Promise<void> {
        try {
            const attribution = await this.guardrails.searchAttribution(snippet)
            if (isError(attribution)) {
                await this.postMessage({
                    type: 'attribution',
                    snippet,
                    error: attribution.message,
                })
                return
            }
            await this.postMessage({
                type: 'attribution',
                snippet,
                attribution: {
                    repositoryNames: attribution.repositories.map(r => r.name),
                    limitHit: attribution.limitHit,
                },
            })
        } catch (error) {
            await this.postMessage({
                type: 'attribution',
                snippet,
                error: `${error}`,
            })
        }
    }

    private async handleChooseRemoteSearchRepo(explicitRepos?: Repo[]): Promise<void> {
        if (!this.remoteSearch) {
            return
        }
        const repos =
            explicitRepos ??
            (await this.repoPicker?.show(this.remoteSearch.getRepos(RepoInclusion.Manual)))
        if (repos) {
            this.chatModel.setSelectedRepos(repos)
            this.remoteSearch.setRepos(repos, RepoInclusion.Manual)
        }
    }

    private handleRemoveRemoteSearchRepo(repoId: string): void {
        this.remoteSearch?.removeRepo(repoId)
    }

    // #endregion
    // =======================================================================
    // #region view updaters
    // =======================================================================

    private postEmptyMessageInProgress(): void {
        this.postViewTranscript({ speaker: 'assistant' })
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

        // Update webview panel title
        this.postChatTitle()
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
            void this.postMessage({
                type: 'transcript-errors',
                isTranscriptError: true,
            })
            return
        }

        void this.postMessage({ type: 'errors', errors: error.message })
    }

    private postChatModels(): void {
        const authStatus = this.authProvider.getAuthStatus()
        if (!authStatus?.isLoggedIn) {
            return
        }
        if (authStatus?.configOverwrites?.chatModel) {
            ModelProvider.add(
                new ModelProvider(authStatus.configOverwrites.chatModel, [
                    ModelUsage.Chat,
                    // TODO: Add configOverwrites.editModel for separate edit support
                    ModelUsage.Edit,
                ])
            )
        }
        const models = ModelProvider.get(ModelUsage.Chat, authStatus.endpoint, this.chatModel.modelID)

        void this.postMessage({
            type: 'chatModels',
            models,
        })
    }

    private postContextStatus(): void {
        logDebug(
            'SimpleChatPanelProvider',
            'postContextStatusToWebView',
            JSON.stringify(this.contextStatusAggregator.status)
        )
        void this.postMessage({
            type: 'enhanced-context',
            enhancedContextStatus: {
                groups: this.contextStatusAggregator.status,
            },
        })
    }

    /**
     * Low-level utility to post a message to the webview, pending initialization.
     *
     * cody-invariant: this.webview?.postMessage should never be invoked directly
     * except within this method.
     */
    private postMessage(message: ExtensionMessage): Thenable<boolean | undefined> {
        return this.initDoer.do(() => this.webview?.postMessage(message))
    }

    private postChatTitle(): void {
        if (this.webviewPanel) {
            this.webviewPanel.title = this.chatModel.getChatTitle()
        }
    }

    // #endregion
    // =======================================================================
    // #region chat request lifecycle methods
    // =======================================================================

    /**
     * Constructs the prompt and updates the UI with the context used in the prompt.
     */
    private async buildPrompt(
        prompter: IPrompter,
        sendTelemetry?: (contextSummary: any) => void
    ): Promise<Message[]> {
        const maxChars = getContextWindowForModel(
            this.authProvider.getAuthStatus(),
            this.chatModel.modelID
        )
        const { prompt, newContextUsed } = await prompter.makePrompt(this.chatModel, maxChars)

        // Update UI based on prompt construction
        this.chatModel.setNewContextUsed(newContextUsed)

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

    private streamAssistantResponse(
        requestID: string,
        prompt: Message[],
        span: Span,
        firstTokenSpan: Span
    ): void {
        logDebug('SimpleChatPanelProvider', 'streamAssistantResponse', {
            verbose: { requestID, prompt },
        })
        let firstTokenMeasured = false
        function measureFirstToken() {
            if (firstTokenMeasured) {
                return
            }
            firstTokenMeasured = true
            span.addEvent('firstToken')
            firstTokenSpan.end()
        }

        this.postEmptyMessageInProgress()
        this.sendLLMRequest(prompt, {
            update: content => {
                measureFirstToken()
                span.addEvent('update')
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
                measureFirstToken()
                recordExposedExperimentsToSpan(span)
                span.end()
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
                recordErrorToSpan(span, error)
            },
        })
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

    // #endregion
    // =======================================================================
    // #region session management
    // =======================================================================

    // A unique identifier for this SimpleChatPanelProvider instance used to identify
    // it when a handle to this specific panel provider is needed.
    public get sessionID(): string {
        return this.chatModel.sessionID
    }

    // Sets the provider up for a new chat that is not being restored from a
    // saved session.
    public async newSession(): Promise<void> {
        // Set the remote search's selected repos to the workspace repo list
        // by default.
        this.remoteSearch?.setRepos(
            (await this.repoPicker?.getDefaultRepos()) || [],
            RepoInclusion.Manual
        )
    }

    // Attempts to restore the chat to the given sessionID, if it exists in
    // history. If it does, then saves the current session and cancels the
    // current in-progress completion. If the chat does not exist, then this
    // is a no-op.
    public async restoreSession(sessionID: string): Promise<void> {
        const oldTranscript = this.history.getChat(this.authProvider.getAuthStatus(), sessionID)
        if (!oldTranscript) {
            return this.newSession()
        }
        this.cancelInProgressCompletion()
        const newModel = await newChatModelfromTranscriptJSON(oldTranscript, this.chatModel.modelID)
        this.chatModel = newModel

        // Restore per-chat enhanced context settings
        if (this.remoteSearch) {
            const repos =
                this.chatModel.getSelectedRepos() || (await this.repoPicker?.getDefaultRepos()) || []
            this.remoteSearch.setRepos(repos, RepoInclusion.Manual)
        }

        this.postViewTranscript()
    }

    private async saveSession(humanInput?: ChatInputHistory): Promise<void> {
        const allHistory = await this.history.saveChat(
            this.authProvider.getAuthStatus(),
            this.chatModel.toTranscriptJSON(),
            humanInput
        )
        if (allHistory) {
            void this.postMessage({
                type: 'history',
                localHistory: allHistory,
            })
        }
        await this.treeView.updateTree(this.authProvider.getAuthStatus())
    }

    public async clearAndRestartSession(): Promise<void> {
        if (this.chatModel.isEmpty()) {
            return
        }

        this.cancelInProgressCompletion()
        await this.saveSession()

        this.chatModel = new SimpleChatModel(this.chatModel.modelID)
        this.postViewTranscript()
    }

    // #endregion
    // =======================================================================
    // #region webview container management
    // =======================================================================

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
        this.postContextStatus()

        // Dispose panel when the panel is closed
        panel.onDidDispose(() => {
            this.cancelInProgressCompletion()
            this._webviewPanel = undefined
            this._webview = undefined
            panel.dispose()
        })

        // Let the webview know if it is active
        panel.onDidChangeViewState(event =>
            this.postMessage({ type: 'webview-state', isActive: event.webviewPanel.active })
        )

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
            type: 'setConfigFeatures',
            configFeatures: {
                chat: configFeatures.chat,
                attribution: configFeatures.attribution,
            },
        })

        return panel
    }

    public async setWebviewView(view: View): Promise<void> {
        if (view !== 'chat') {
            // Only chat view is supported in the webview panel.
            // When a different view is requested,
            // Set context to notifiy the webview panel to close.
            // This should close the webview panel and open the login view in the sidebar.
            await vscode.commands.executeCommand('setContext', CodyChatPanelViewType, false)
            await vscode.commands.executeCommand('setContext', 'cody.activated', false)
            return
        }
        if (!this.webviewPanel) {
            await this.createWebviewPanel()
        }
        this.webviewPanel?.reveal()

        await this.postMessage({
            type: 'view',
            view: view,
        })
    }

    // #endregion
    // =======================================================================
    // #region other public accessors and mutators
    // =======================================================================

    public setChatTitle(title: string): void {
        // Skip storing default chat title
        if (title !== 'New Chat') {
            this.chatModel.setCustomChatTitle(title)
        }
        this.postChatTitle()
    }

    // Convenience function for tests
    public getViewTranscript(): ChatMessage[] {
        return this.chatModel.getMessagesWithContext().map(m => toViewMessage(m))
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
        json.chatTitle,
        json.enhancedContext?.selectedRepos
    )
}

export async function contextFilesToContextItems(
    editor: Editor,
    items: ContextItem[],
    fetchContent?: boolean
): Promise<ContextItem[]> {
    return (
        await Promise.all(
            items.map(async (item: ContextItem): Promise<ContextItem | null> => {
                const range = viewRangeToRange(item.range)
                let content = item.content
                if (!item.content && fetchContent) {
                    try {
                        content = await editor.getTextEditorContentForFile(item.uri, range)
                    } catch (error) {
                        void vscode.window.showErrorMessage(
                            `Cody could not include context from ${item.uri}. (Reason: ${error})`
                        )
                        return null
                    }
                }
                return { ...item, content: content! }
            })
        )
    ).filter(isDefined)
}

function deserializedContextFilesToContextItems(
    files: ContextItem[],
    contextMessages: ContextMessage[]
): ContextItem[] {
    const contextByFile = new Map<string /* uri.toString() */, ContextMessage>()
    for (const contextMessage of contextMessages) {
        if (!contextMessage.file) {
            continue
        }
        contextByFile.set(contextMessage.file.uri.toString(), contextMessage)
    }

    return files.map((file: ContextItem): ContextItem => {
        const range = viewRangeToRange(file.range)
        let text = file.content
        if (!text) {
            const contextMessage = contextByFile.get(file.uri.toString())
            if (contextMessage) {
                text = stripContextWrapper(contextMessage.text || '')
            }
        }
        return {
            type: 'file',
            uri: file.uri,
            range,
            content: text || '',
            source: file.source,
            repoName: file.repoName,
            revision: file.revision,
            title: file.title,
        }
    })
}

function isAbortError(error: Error): boolean {
    return error.message === 'aborted' || error.message === 'socket hang up'
}

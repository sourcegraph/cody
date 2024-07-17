import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type BillingCategory,
    type BillingProduct,
    CHAT_INPUT_TOKEN_BUDGET,
    CHAT_OUTPUT_TOKEN_BUDGET,
    type ChatClient,
    type ChatMessage,
    ClientConfigSingleton,
    CodyIDE,
    type ContextItem,
    ContextItemSource,
    DOTCOM_URL,
    type DefaultChatCommands,
    type EventSource,
    FeatureFlag,
    type Guardrails,
    type MentionQuery,
    type Message,
    ModelUsage,
    ModelsService,
    PromptString,
    type RankedContext,
    type SerializedChatInteraction,
    type SerializedChatTranscript,
    type SerializedPromptEditorState,
    TokenCounter,
    Typewriter,
    addMessageListenersForExtensionAPI,
    allMentionProvidersMetadata,
    asyncGeneratorFromPromise,
    createMessageAPIForExtension,
    featureFlagProvider,
    getContextForChatMessage,
    hydrateAfterPostMessage,
    inputTextWithoutContextChipsFromPromptEditorState,
    isAbortError,
    isAbortErrorOrSocketHangUp,
    isContextWindowLimitError,
    isDefined,
    isError,
    isFileURI,
    isRateLimitError,
    parseMentionQuery,
    recordErrorToSpan,
    reformatBotMessageForChat,
    serializeChatMessage,
    telemetryRecorder,
    tracer,
    truncatePromptString,
    webMentionProvidersMetadata,
} from '@sourcegraph/cody-shared'

import type { Span } from '@opentelemetry/api'
import { captureException } from '@sentry/core'
import type { TelemetryEventParameters } from '@sourcegraph/telemetry'
import type { URI } from 'vscode-uri'
import { version as VSCEVersion } from '../../../package.json'
import { View } from '../../../webviews/tabs/types'
import {
    closeAuthProgressIndicator,
    startAuthProgressIndicator,
} from '../../auth/auth-progress-indicator'
import type { startTokenReceiver } from '../../auth/token-receiver'
import { getContextFileFromUri } from '../../commands/context/file-path'
import { getContextFileFromCursor, getContextFileFromSelection } from '../../commands/context/selection'
import { getConfiguration, getFullConfig } from '../../configuration'
import type { EnterpriseContextFactory } from '../../context/enterprise-context-factory'
import { type RemoteSearch, RepoInclusion } from '../../context/remote-search'
import type { Repo } from '../../context/repo-fetcher'
import type { RemoteRepoPicker } from '../../context/repo-picker'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { ContextRankingController } from '../../local-context/context-ranking'
import { ContextStatusAggregator } from '../../local-context/enhanced-context-status'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'
import { migrateAndNotifyForOutdatedModels } from '../../models/modelMigrator'
import { mergedPromptsAndLegacyCommands } from '../../prompts/prompts'
import { gitCommitIdFromGitExtension } from '../../repository/git-extension-api'
import type { AuthProvider } from '../../services/AuthProvider'
import { AuthProviderSimplified } from '../../services/AuthProviderSimplified'
import { recordExposedExperimentsToSpan } from '../../services/open-telemetry/utils'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
    handleSmartApply,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks, openLocalFileWithRange } from '../../services/utils/workspace-action'
import { TestSupport } from '../../test-support'
import type { MessageErrorType } from '../MessageProvider'
import {
    getCorpusContextItemsForEditorState,
    startClientStateBroadcaster,
} from '../clientStateBroadcaster'
import { type GetContextItemsTelemetry, getChatContextItemsForMention } from '../context/chatContext'
import type { ContextAPIClient } from '../context/contextAPIClient'
import type {
    ChatSubmitType,
    ConfigurationSubsetForWebview,
    ExtensionMessage,
    LocalEnv,
    WebviewMessage,
} from '../protocol'
import { countGeneratedCode } from '../utils'
import { chatHistory } from './ChatHistoryManager'
import { ChatModel, prepareChatMessage } from './ChatModel'
import { CodyChatEditorViewType } from './ChatsController'
import { CodebaseStatusProvider } from './CodebaseStatusProvider'
import { type ContextRetriever, toStructuredMentions } from './ContextRetriever'
import { InitDoer } from './InitDoer'
import { getChatPanelTitle, openFile } from './chat-helpers'
import { type HumanInput, getContextStrategy, getPriorityContext, resolveContext } from './context'
import { DefaultPrompter } from './prompt'

interface ChatControllerOptions {
    extensionUri: vscode.Uri
    authProvider: AuthProvider
    chatClient: ChatClient

    localEmbeddings: LocalEmbeddingsController | null
    symf: SymfRunner | null
    enterpriseContext: EnterpriseContextFactory | null

    contextRetriever: ContextRetriever
    contextAPIClient: ContextAPIClient | null

    editor: VSCodeEditor
    guardrails: Guardrails
    startTokenReceiver?: typeof startTokenReceiver
}

export interface ChatSession {
    webviewPanelOrView: vscode.WebviewView | vscode.WebviewPanel | undefined
    sessionID: string
}

/**
 * ChatController is the view controller class for the chat panel.
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
export class ChatController implements vscode.Disposable, vscode.WebviewViewProvider, ChatSession {
    private chatModel: ChatModel

    private readonly authProvider: AuthProvider
    private readonly chatClient: ChatClient
    private readonly codebaseStatusProvider: CodebaseStatusProvider

    private readonly localEmbeddings: LocalEmbeddingsController | null
    private readonly symf: SymfRunner | null
    private readonly remoteSearch: RemoteSearch | null

    private readonly contextRetriever: ContextRetriever

    private readonly contextStatusAggregator = new ContextStatusAggregator()
    private readonly editor: VSCodeEditor
    private readonly guardrails: Guardrails
    private readonly repoPicker: RemoteRepoPicker | null
    private readonly startTokenReceiver: typeof startTokenReceiver | undefined
    private readonly contextAPIClient: ContextAPIClient | null

    private disposables: vscode.Disposable[] = []

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.disposables = []
    }

    constructor({
        extensionUri,
        authProvider,
        chatClient,
        localEmbeddings,
        symf,
        editor,
        guardrails,
        enterpriseContext,
        startTokenReceiver,
        contextAPIClient,
        contextRetriever,
    }: ChatControllerOptions) {
        this.extensionUri = extensionUri
        this.authProvider = authProvider
        this.chatClient = chatClient
        this.localEmbeddings = localEmbeddings
        this.symf = symf
        this.repoPicker = enterpriseContext?.repoPicker || null
        this.remoteSearch = enterpriseContext?.createRemoteSearch() || null
        this.editor = editor

        this.contextRetriever = contextRetriever

        this.chatModel = new ChatModel(getDefaultModelID())

        this.guardrails = guardrails
        this.startTokenReceiver = startTokenReceiver
        this.contextAPIClient = contextAPIClient

        if (TestSupport.instance) {
            TestSupport.instance.chatPanelProvider.set(this)
        }

        // Advise local embeddings to start up if necessary.
        void this.localEmbeddings?.start()

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
            this.symf,
            enterpriseContext ? enterpriseContext.getCodebaseRepoIdMapper() : null
        )
        this.disposables.push(this.contextStatusAggregator.addProvider(this.codebaseStatusProvider))

        // Keep feature flags updated.
        this.disposables.push({
            dispose: featureFlagProvider.onFeatureFlagChanged('', () => {
                void this.postConfigFeatures()
            }),
        })

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

        this.disposables.push(
            startClientStateBroadcaster({
                remoteSearch: this.remoteSearch,
                postMessage: (message: ExtensionMessage) => this.postMessage(message),
                chatModel: this.chatModel,
            })
        )

        // Observe any changes in chat history and send client notifications to
        // the consumer
        this.disposables.push(
            chatHistory.onHistoryChanged(chatHistory => {
                this.postMessage({ type: 'history', localHistory: chatHistory })
            })
        )
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
                    PromptString.unsafe_fromUserQuery(message.text),
                    message.submitType,
                    message.contextFiles ?? [],
                    message.editorState as SerializedPromptEditorState,
                    message.addEnhancedContext ?? false,
                    this.startNewSubmitOrEditOperation(),
                    'chat'
                )
                break
            }
            case 'edit': {
                await this.handleEdit(
                    uuid.v4(),
                    PromptString.unsafe_fromUserQuery(message.text),
                    message.index ?? undefined,
                    message.contextFiles ?? [],
                    message.editorState as SerializedPromptEditorState,
                    message.addEnhancedContext || false
                )
                break
            }
            case 'abort':
                this.handleAbort()
                break
            case 'chatModel':
                // Because this was a user action to change the model we will set that
                // as a global default for chat
                await ModelsService.setSelectedModel(ModelUsage.Chat, message.model)
                this.handleSetChatModel(message.model)
                break
            case 'get-chat-models':
                this.postChatModels()
                break
            case 'getUserContext': {
                const result = await this.handleGetUserContextFilesCandidates({
                    query: parseMentionQuery(message.query, null),
                })
                await this.postMessage({
                    type: 'userContextFiles',
                    userContextFiles: result.userContextFiles,
                })
                break
            }
            case 'insert':
                await handleCodeFromInsertAtCursor(message.text)
                break
            case 'copy':
                await handleCopiedCode(message.text, message.eventType === 'Button')
                break
            case 'smartApply':
                await handleSmartApply(message.code, message.instruction, message.fileName)
                break
            case 'openURI':
                vscode.commands.executeCommand('vscode.open', message.uri)
                break
            case 'links':
                void openExternalLinks(message.value)
                break
            case 'openFile':
                await openFile(
                    message.uri,
                    message.range ?? undefined,
                    this._webviewPanelOrView && 'viewColumn' in this._webviewPanelOrView
                        ? this._webviewPanelOrView.viewColumn
                        : undefined
                )
                break
            case 'openLocalFileWithRange':
                await openLocalFileWithRange(message.filePath, message.range ?? undefined)
                break
            case 'newFile':
                await handleCodeFromSaveToNewFile(message.text, this.editor)
                break
            case 'context/get-remote-search-repos': {
                await this.postMessage({
                    type: 'context/remote-repos',
                    repos: this.chatModel.getSelectedRepos() ?? [],
                })
                break
            }
            case 'context/choose-remote-search-repo': {
                await this.handleChooseRemoteSearchRepo(message.explicitRepos ?? undefined)
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
                this.setWebviewView(View.Chat)
                break
            case 'reset':
                await this.clearAndRestartSession()
                break
            case 'command':
                vscode.commands.executeCommand(message.id, message.arg)
                break
            case 'event':
                // no-op, legacy v1 telemetry has been removed. This should be removed as well.
                break
            case 'recordEvent':
                telemetryRecorder.recordEvent(
                    // 👷 HACK: We have no control over what gets sent over JSON RPC,
                    // so we depend on client implementations to give type guidance
                    // to ensure that we don't accidentally share arbitrary,
                    // potentially sensitive string values. In this RPC handler,
                    // when passing the provided event to the TelemetryRecorder
                    // implementation, we forcibly cast all the inputs below
                    // (feature, action, parameters) into known types (strings
                    // 'feature', 'action', 'key') so that the recorder will accept
                    // it. DO NOT do this elsewhere!
                    message.feature as 'feature',
                    message.action as 'action',
                    message.parameters as TelemetryEventParameters<
                        { key: number },
                        BillingProduct,
                        BillingCategory
                    >
                )
                break
            case 'auth': {
                if (message.authKind === 'callback' && message.endpoint) {
                    this.authProvider.redirectToEndpointLogin(message.endpoint)
                    break
                }
                if (message.authKind === 'offline') {
                    this.authProvider.auth({ endpoint: '', token: '', isOfflineMode: true })
                    break
                }
                if (message.authKind === 'simplified-onboarding') {
                    const endpoint = DOTCOM_URL.href

                    let tokenReceiverUrl: string | undefined = undefined
                    closeAuthProgressIndicator()
                    startAuthProgressIndicator()
                    tokenReceiverUrl = await this.startTokenReceiver?.(
                        endpoint,
                        async (token, endpoint) => {
                            closeAuthProgressIndicator()
                            const authStatus = await this.authProvider.auth({ endpoint, token })
                            telemetryRecorder.recordEvent(
                                'cody.auth.fromTokenReceiver.web',
                                'succeeded',
                                {
                                    metadata: {
                                        success: authStatus?.isLoggedIn ? 1 : 0,
                                    },
                                }
                            )
                            if (!authStatus?.isLoggedIn) {
                                void vscode.window.showErrorMessage(
                                    'Authentication failed. Please check your token and try again.'
                                )
                            }
                        }
                    )

                    const authProviderSimplified = new AuthProviderSimplified()
                    const authMethod = message.authMethod || 'dotcom'
                    const successfullyOpenedUrl = await authProviderSimplified.openExternalAuthUrl(
                        this.authProvider,
                        authMethod,
                        tokenReceiverUrl
                    )
                    if (!successfullyOpenedUrl) {
                        closeAuthProgressIndicator()
                    }
                    break
                }
                // cody.auth.signin or cody.auth.signout
                await vscode.commands.executeCommand(`cody.auth.${message.authKind}`)
                break
            }
            case 'simplified-onboarding': {
                if (message.onboardingKind === 'web-sign-in-token') {
                    void vscode.window
                        .showInputBox({ prompt: 'Enter web sign-in token' })
                        .then(async token => {
                            if (!token) {
                                return
                            }
                            const authStatus = await this.authProvider.auth({
                                endpoint: DOTCOM_URL.href,
                                token,
                            })
                            if (!authStatus?.isLoggedIn) {
                                void vscode.window.showErrorMessage(
                                    'Authentication failed. Please check your token and try again.'
                                )
                            }
                        })
                    break
                }
                break
            }
            case 'troubleshoot/reloadAuth': {
                await this.authProvider.reloadAuthStatus()
                const nextAuth = this.authProvider.getAuthStatus()
                telemetryRecorder.recordEvent('cody.troubleshoot', 'reloadAuth', {
                    metadata: {
                        success: nextAuth.isLoggedIn ? 1 : 0,
                    },
                })
                break
            }
        }
    }

    private async isSmartApplyEnabled(): Promise<boolean> {
        if (!this.authProvider.getAuthStatus().isDotCom) {
            // Only supported on Sourcegraph.com right now, until we support more than just Claude 3.5 Sonnet.
            return false
        }

        const config = await getFullConfig()
        if (config.isRunningInsideAgent) {
            // Only supported in VS Code right now, until we test and iterate on the UI for other clients.
            return false
        }

        return (
            config.internalUnstable ||
            (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyExperimentalSmartApply))
        )
    }

    private async getConfigForWebview(): Promise<ConfigurationSubsetForWebview & LocalEnv> {
        const [config, experimentalSmartApply] = await Promise.all([
            getFullConfig(),
            this.isSmartApplyEnabled(),
        ])

        const webviewType =
            this.webviewPanelOrView?.viewType === 'cody.editorPanel' ? 'editor' : 'sidebar'

        return {
            agentIDE: config.isRunningInsideAgent ? config.agentIDE : CodyIDE.VSCode,
            agentExtensionVersion: config.isRunningInsideAgent
                ? config.agentExtensionVersion
                : VSCEVersion,
            uiKindIsWeb: vscode.env.uiKind === vscode.UIKind.Web,
            serverEndpoint: config.serverEndpoint,
            experimentalNoodle: config.experimentalNoodle,
            experimentalSmartApply,
            webviewType,
        }
    }

    // =======================================================================
    // #region top-level view action handlers
    // =======================================================================

    public setAuthStatus(_: AuthStatus): void {
        // Run this async because this method may be called during initialization
        // and awaiting on this.postMessage may result in a deadlock
        void this.sendConfig()

        // Get the latest model list available to the current user to update the ChatModel.
        this.handleSetChatModel(getDefaultModelID())

        void this.postConfigFeatures()
    }

    // When the webview sends the 'ready' message, respond by posting the view config
    private async handleReady(): Promise<void> {
        await this.sendConfig()
        await this.postConfigFeatures()

        // Update the chat model providers again to ensure the correct token limit is set on ready
        this.handleSetChatModel(this.chatModel.modelID)
    }

    private async sendConfig(): Promise<void> {
        const authStatus = this.authProvider.getAuthStatus()
        const configForWebview = await this.getConfigForWebview()
        const workspaceFolderUris =
            vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? []
        await this.postMessage({
            type: 'config',
            config: configForWebview,
            authStatus,
            workspaceFolderUris,
        })
        logDebug('ChatController', 'updateViewConfig', {
            verbose: configForWebview,
        })
    }

    private initDoer = new InitDoer<boolean | undefined>()
    private async handleInitialized(): Promise<void> {
        // HACK: this call is necessary to get the webview to set the chatID state,
        // which is necessary on deserialization. It should be invoked before the
        // other initializers run (otherwise, it might interfere with other view
        // state)
        await this.webviewPanelOrView?.webview.postMessage({
            type: 'transcript',
            messages: [],
            isMessageInProgress: false,
            chatID: this.chatModel.sessionID,
        })

        this.postChatModels()
        await this.saveSession()
        this.initDoer.signalInitialized()
        await this.sendConfig()
    }

    private async getRepoMetadataIfPublic(): Promise<string> {
        const currentCodebase = await this.codebaseStatusProvider.currentCodebase()
        if (currentCodebase?.isPublic) {
            const gitMetadata = {
                githubUrl: currentCodebase?.remote,
                commit: gitCommitIdFromGitExtension(currentCodebase?.localFolder),
            }
            return JSON.stringify(gitMetadata)
        }
        return ''
    }

    /**
     * Handles user input text for both new and edit submissions
     */
    public async handleUserMessageSubmission(
        requestID: string,
        inputText: PromptString,
        submitType: ChatSubmitType,
        mentions: ContextItem[],
        editorState: SerializedPromptEditorState | null,
        legacyAddEnhancedContext: boolean,
        signal: AbortSignal,
        source?: EventSource,
        command?: DefaultChatCommands
    ): Promise<void> {
        return tracer.startActiveSpan('chat.submit', async (span): Promise<void> => {
            span.setAttribute('sampled', true)
            const authStatus = this.authProvider.getAuthStatus()
            const sharedProperties = {
                requestID,
                chatModel: this.chatModel.modelID,
                source,
                command,
                traceId: span.spanContext().traceId,
                sessionID: this.chatModel.sessionID,
                addEnhancedContext: legacyAddEnhancedContext,
            }
            await this.recordChatQuestionTelemetryEvent(
                authStatus,
                legacyAddEnhancedContext,
                mentions,
                sharedProperties,
                inputText
            )

            tracer.startActiveSpan('chat.submit.firstToken', async (firstTokenSpan): Promise<void> => {
                if (inputText.toString().match(/^\/reset$/)) {
                    span.addEvent('clearAndRestartSession')
                    span.end()
                    return this.clearAndRestartSession()
                }

                if (submitType === 'user-newchat' && !this.chatModel.isEmpty()) {
                    span.addEvent('clearAndRestartSession')
                    await this.clearAndRestartSession()
                    signal.throwIfAborted()
                }

                this.chatModel.addHumanMessage({ text: inputText, editorState })
                await this.saveSession()
                signal.throwIfAborted()

                this.postEmptyMessageInProgress()
                this.contextAPIClient?.detectChatIntent(requestID, inputText.toString())

                // All mentions we receive are either source=initial or source=user. If the caller
                // forgot to set the source, assume it's from the user.
                mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

                // If the legacyAddEnhancedContext param is true, then pretend there is a `@repo` or `@tree`
                // mention and a mention of the current selection to match the old behavior.
                if (legacyAddEnhancedContext) {
                    const corpusMentions = getCorpusContextItemsForEditorState({
                        remoteSearch: this.remoteSearch,
                    })
                    mentions = mentions.concat(corpusMentions)

                    const selectionContext = source === 'chat' ? await getContextFileFromSelection() : []
                    signal.throwIfAborted()
                    mentions = mentions.concat(selectionContext)
                }

                const contextAlternatives = await this.computeContext(
                    { text: inputText, mentions },
                    requestID,
                    editorState,
                    span,
                    signal
                )
                signal.throwIfAborted()
                const corpusContext = contextAlternatives[0].items

                const explicitMentions = corpusContext.filter(c => c.source === ContextItemSource.User)
                const implicitMentions = corpusContext.filter(c => c.source !== ContextItemSource.User)

                const prompter = new DefaultPrompter(
                    explicitMentions,
                    implicitMentions,
                    command !== undefined
                )
                const sendTelemetry = (contextSummary: any, privateContextSummary?: any): void => {
                    const properties = {
                        ...sharedProperties,
                        traceId: span.spanContext().traceId,
                    }
                    span.setAttributes(properties)
                    firstTokenSpan.setAttributes(properties)

                    telemetryRecorder.recordEvent('cody.chat-question', 'executed', {
                        metadata: {
                            ...contextSummary,
                            // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                            // See https://github.com/sourcegraph/sourcegraph/pull/59524
                            recordsPrivateMetadataTranscript: authStatus.isDotCom ? 1 : 0,
                        },
                        privateMetadata: {
                            properties,
                            privateContextSummary: privateContextSummary,
                            // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                            // V2 telemetry exports privateMetadata only for DotCom users
                            // the condition below is an additional safeguard measure
                            promptText:
                                authStatus.isDotCom &&
                                truncatePromptString(inputText, CHAT_INPUT_TOKEN_BUDGET),
                        },
                    })
                }

                try {
                    const prompt = await this.buildPrompt(
                        prompter,
                        signal,
                        requestID,
                        sendTelemetry,
                        contextAlternatives
                    )
                    signal.throwIfAborted()
                    this.streamAssistantResponse(requestID, prompt, span, firstTokenSpan, signal)
                } catch (error) {
                    if (isAbortErrorOrSocketHangUp(error as Error)) {
                        return
                    }
                    if (isRateLimitError(error) || isContextWindowLimitError(error)) {
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

    private async computeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        const legacyContextPromise = this.legacyComputeContext(
            { text, mentions },
            requestID,
            editorState,
            span,
            signal
        )
        if (!vscode.workspace.getConfiguration().get<boolean>('cody.internal.serverSideContext')) {
            return legacyContextPromise
        }

        const contextPromise = this._computeContext(
            { text, mentions },
            requestID,
            editorState,
            span,
            signal
        )
        return (await Promise.all([contextPromise, legacyContextPromise])).flat()
    }

    private async _computeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        // Remove context chips (repo, @-mentions) from the input text for context retrieval.
        const inputTextWithoutContextChips = editorState
            ? PromptString.unsafe_fromUserQuery(
                  inputTextWithoutContextChipsFromPromptEditorState(editorState)
              )
            : text
        const structuredMentions = toStructuredMentions(mentions)
        const retrievedContextPromise = this.contextRetriever.retrieveContext(
            structuredMentions,
            inputTextWithoutContextChips,
            span,
            signal
        )
        const priorityContextPromise = retrievedContextPromise.then(p =>
            getPriorityContext(text, this.editor, p)
        )
        const openCtxContextPromise = getContextForChatMessage(text.toString(), signal)
        const [priorityContext, retrievedContext, openCtxContext] = await Promise.all([
            priorityContextPromise,
            retrievedContextPromise,
            openCtxContextPromise,
        ])

        // This is the manual ordering of the different retrieved and explicit context sources
        const context = [
            structuredMentions.symbols,
            structuredMentions.files,
            openCtxContext,
            priorityContext,
            retrievedContext,
        ].flat()

        if (this.contextAPIClient && context.length > 0) {
            const response = await this.contextAPIClient.rankContext(
                requestID,
                inputTextWithoutContextChips.toString(),
                context
            )
            if (isError(response)) {
                throw response
            }
            if (!response) {
                throw new Error('empty response from context reranking API')
            }
            const { used, ignored } = response
            const all: [ContextItem, number][] = []
            const usedContext: ContextItem[] = []
            const ignoredContext: ContextItem[] = []
            for (const { index, score } of used) {
                usedContext.push(context[index])
                all.push([context[index], score])
            }
            for (const { index, score } of ignored) {
                ignoredContext.push(context[index])
                all.push([context[index], score])
            }
            return [
                { strategy: 'local+remote, reranked', items: usedContext },
                { strategy: 'local+remote', items: context },
            ]
        }

        return [{ strategy: 'local+remote', items: context }]
    }

    private async legacyComputeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        // Fetch using legacy context retrieval
        const config = getConfiguration()
        const contextStrategy = await getContextStrategy(config.useContext)
        span.setAttribute('strategy', contextStrategy)

        // Remove context chips (repo, @-mentions) from the input text for context retrieval.
        const inputTextWithoutContextChips = editorState
            ? PromptString.unsafe_fromUserQuery(
                  inputTextWithoutContextChipsFromPromptEditorState(editorState)
              )
            : text

        const context = (
            await Promise.all([
                resolveContext({
                    strategy: contextStrategy,
                    editor: this.editor,
                    input: { text: inputTextWithoutContextChips, mentions },
                    providers: {
                        localEmbeddings: this.localEmbeddings,
                        symf: this.symf,
                        remoteSearch: this.remoteSearch,
                    },
                    signal,
                }),
                getContextForChatMessage(text.toString(), signal),
            ])
        ).flat()

        // Run in background.
        void this.contextAPIClient?.rankContext(
            requestID,
            inputTextWithoutContextChips.toString(),
            context
        )

        return [
            {
                strategy: `(legacy)${contextStrategy}`,
                items: context.flat(),
            },
        ]
    }

    private submitOrEditOperation: AbortController | undefined
    public startNewSubmitOrEditOperation(): AbortSignal {
        this.submitOrEditOperation?.abort()
        this.submitOrEditOperation = new AbortController()
        return this.submitOrEditOperation.signal
    }
    private cancelSubmitOrEditOperation(): void {
        if (this.submitOrEditOperation) {
            this.submitOrEditOperation.abort()
            this.submitOrEditOperation = undefined
        }
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
        text: PromptString,
        index: number | undefined,
        contextFiles: ContextItem[],
        editorState: SerializedPromptEditorState | null,
        addEnhancedContext = true
    ): Promise<void> {
        const abortSignal = this.startNewSubmitOrEditOperation()

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
                editorState,
                addEnhancedContext,
                abortSignal,
                'chat'
            )
        } catch {
            this.postError(new Error('Failed to edit prompt'), 'transcript')
        }
    }

    private handleAbort(): void {
        this.cancelSubmitOrEditOperation()
        // Notify the webview there is no message in progress.
        this.postViewTranscript()
        telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked')
    }

    private handleSetChatModel(modelID: string) {
        this.chatModel.updateModel(modelID)
        this.postChatModels()
    }

    private async handleGetUserContextFilesCandidates({
        query,
    }: { query: MentionQuery }): Promise<
        Omit<Extract<ExtensionMessage, { type: 'userContextFiles' }>, 'type'>
    > {
        const source = 'chat'

        // Use numerical mapping to send source values to metadata, making this data available on all instances.
        const atMentionSourceTelemetryMetadataMapping: Record<typeof source, number> = {
            chat: 1,
        } as const

        const scopedTelemetryRecorder: GetContextItemsTelemetry = {
            empty: () => {
                telemetryRecorder.recordEvent('cody.at-mention', 'executed', {
                    metadata: {
                        source: atMentionSourceTelemetryMetadataMapping[source],
                    },
                    privateMetadata: { source },
                })
            },
            withProvider: (provider, providerMetadata) => {
                telemetryRecorder.recordEvent(`cody.at-mention.${provider}`, 'executed', {
                    metadata: { source: atMentionSourceTelemetryMetadataMapping[source] },
                    privateMetadata: { source, providerMetadata },
                })
            },
        }

        try {
            const config = await getFullConfig()
            const isCodyWeb = config.agentIDE === CodyIDE.Web

            const items = await getChatContextItemsForMention({
                mentionQuery: query,
                telemetryRecorder: scopedTelemetryRecorder,
                rangeFilter: !isCodyWeb,
                remoteRepositoriesNames: query.includeRemoteRepositories
                    ? this.remoteSearch?.getRepos('all')?.map(repo => repo.name)
                    : undefined,
            })

            const { input, context } = this.chatModel.contextWindow
            const userContextFiles = items.map(f => ({
                ...f,
                isTooLarge: f.size ? f.size > (context?.user || input) : undefined,
            }))
            return { userContextFiles }
        } catch (error) {
            if (isAbortError(error)) {
                throw error // rethrow as-is so it gets ignored by our caller
            }
            throw new Error(`Error retrieving context files: ${error}`)
        }
    }

    public async handleGetUserEditorContext(uri?: URI): Promise<void> {
        // Get selection from the active editor
        const selection = vscode.window.activeTextEditor?.selection

        // Determine context based on URI presence
        const contextItem = uri
            ? await getContextFileFromUri(uri, selection)
            : await getContextFileFromCursor()

        const { input, context } = this.chatModel.contextWindow
        const userContextSize = context?.user ?? input

        void this.postMessage({
            type: 'clientAction',
            addContextItemsToLastHumanInput: contextItem
                ? [
                      {
                          ...contextItem,
                          type: 'file',
                          // Remove content to avoid sending large data to the webview
                          content: undefined,
                          isTooLarge: contextItem.size ? contextItem.size > userContextSize : undefined,
                          source: ContextItemSource.User,
                          range: contextItem.range,
                      } satisfies ContextItem,
                  ]
                : [],
        })

        // Reveal the webview panel if it is hidden
        if (this._webviewPanelOrView) {
            revealWebviewViewOrPanel(this._webviewPanelOrView)
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
        this.postViewTranscript({ speaker: 'assistant', model: this.chatModel.modelID })
    }

    private postViewTranscript(messageInProgress?: ChatMessage): void {
        const messages: ChatMessage[] = [...this.chatModel.getMessages()]
        if (messageInProgress) {
            messages.push(messageInProgress)
        }

        // We never await on postMessage, because it can sometimes hang indefinitely:
        // https://github.com/microsoft/vscode/issues/159431
        void this.postMessage({
            type: 'transcript',
            messages: messages.map(prepareChatMessage).map(serializeChatMessage),
            isMessageInProgress: !!messageInProgress,
            chatID: this.chatModel.sessionID,
        })

        this.syncPanelTitle()
    }

    private syncPanelTitle() {
        // Update webview panel title if we're in an editor panel
        if (this._webviewPanelOrView && 'reveal' in this._webviewPanelOrView) {
            this._webviewPanelOrView.title = this.chatModel.getChatTitle()
        }
    }

    /**
     * Display error message in webview as part of the chat transcript, or as a system banner alongside the chat.
     */
    private postError(error: Error, type?: MessageErrorType): void {
        logDebug('ChatController: postError', error.message)
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
        captureException(error)
    }

    private postChatModels(): void {
        const authStatus = this.authProvider.getAuthStatus()
        if (!authStatus?.isLoggedIn) {
            return
        }
        const models = ModelsService.getModels(ModelUsage.Chat)

        void this.postMessage({
            type: 'chatModels',
            models,
        })
    }

    private postContextStatus(): void {
        const { status } = this.contextStatusAggregator
        void this.postMessage({
            type: 'enhanced-context',
            enhancedContextStatus: { groups: status },
        })
        // Only log non-empty status to reduce noises.
        if (status.length > 0) {
            logDebug('ChatController', 'postContextStatus', JSON.stringify(status))
        }
    }

    /**
     * Low-level utility to post a message to the webview, pending initialization.
     *
     * cody-invariant: this.webview.postMessage should never be invoked directly
     * except within this method.
     */
    private postMessage(message: ExtensionMessage): Thenable<boolean | undefined> {
        return this.initDoer.do(() => this.webviewPanelOrView?.webview.postMessage(message))
    }

    // #endregion
    // =======================================================================
    // #region chat request lifecycle methods
    // =======================================================================

    /**
     * Constructs the prompt and updates the UI with the context used in the prompt.
     */
    private async buildPrompt(
        prompter: DefaultPrompter,
        abortSignal: AbortSignal,
        requestID: string,
        sendTelemetry?: (contextSummary: any, privateContextSummary?: any) => void,
        contextAlternatives?: RankedContext[]
    ): Promise<Message[]> {
        const experimentalSmartApplyEnabled = await this.isSmartApplyEnabled()
        const { prompt, context } = await prompter.makePrompt(
            this.chatModel,
            this.authProvider.getAuthStatus().codyApiVersion,
            { experimentalSmartApplyEnabled }
        )
        abortSignal.throwIfAborted()

        // Update UI based on prompt construction
        // Includes the excluded context items to display in the UI
        if (vscode.workspace.getConfiguration().get<boolean>('cody.internal.showContextAlternatives')) {
            this.chatModel.setLastMessageContext(
                [...context.used, ...context.ignored],
                contextAlternatives
            )
        } else {
            this.chatModel.setLastMessageContext([...context.used, ...context.ignored])
        }

        // this is not awaited, so we kick the call off but don't block on it returning
        this.contextAPIClient?.recordContext(requestID, context.used, context.ignored)

        if (sendTelemetry) {
            // Create a summary of how many code snippets of each context source are being
            // included in the prompt
            const contextSummary: { [key: string]: number } = {}
            for (const { source } of context.used) {
                if (!source) {
                    continue
                }
                if (contextSummary[source]) {
                    contextSummary[source] += 1
                } else {
                    contextSummary[source] = 1
                }
            }

            const privateContextSummary = await this.buildPrivateContextSummary(context)
            sendTelemetry(contextSummary, privateContextSummary)
        }

        return prompt
    }

    private async buildPrivateContextSummary(context: {
        used: ContextItem[]
        ignored: ContextItem[]
    }): Promise<object> {
        // 🚨 SECURITY: included only for dotcom users & public repos
        const isDotCom = this.authProvider.getAuthStatus().isDotCom
        const isPublic = (await this.codebaseStatusProvider.currentCodebase())?.isPublic

        if (!(isDotCom && isPublic)) {
            return {}
        }

        const getContextSummary = (items: ContextItem[]) => ({
            count: items.length,
            items: items.map(i => ({
                source: i.source,
                size: i.size || TokenCounter.countTokens(i.content || ''),
                content: i.content,
            })),
        })

        return {
            included: getContextSummary(context.used),
            excluded: getContextSummary(context.ignored),
            gitMetadata: await this.getRepoMetadataIfPublic(),
        }
    }

    private streamAssistantResponse(
        requestID: string,
        prompt: Message[],
        span: Span,
        firstTokenSpan: Span,
        abortSignal: AbortSignal
    ): void {
        logDebug('ChatController', 'streamAssistantResponse', {
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

        abortSignal.throwIfAborted()
        this.postEmptyMessageInProgress()
        this.sendLLMRequest(
            prompt,
            {
                update: content => {
                    measureFirstToken()
                    span.addEvent('update')
                    this.postViewTranscript({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(content),
                        model: this.chatModel.modelID,
                    })
                },
                close: content => {
                    measureFirstToken()
                    recordExposedExperimentsToSpan(span)
                    span.end()
                    this.addBotMessage(requestID, PromptString.unsafe_fromLLMResponse(content))
                },
                error: (partialResponse, error) => {
                    this.postError(error, 'transcript')
                    if (isAbortErrorOrSocketHangUp(error)) {
                        abortSignal.throwIfAborted()
                    }
                    try {
                        // We should still add the partial response if there was an error
                        // This'd throw an error if one has already been added
                        this.addBotMessage(
                            requestID,
                            PromptString.unsafe_fromLLMResponse(partialResponse)
                        )
                    } catch {
                        console.error('Streaming Error', error)
                    }
                    recordErrorToSpan(span, error)
                },
            },
            abortSignal
        )
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
        },
        abortSignal: AbortSignal
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

        try {
            const stream = this.chatClient.chat(
                prompt,
                {
                    model: this.chatModel.modelID,
                    maxTokensToSample: this.chatModel.contextWindow.output,
                },
                abortSignal
            )

            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        typewriter.update(message.text)
                        break
                    }
                    case 'complete': {
                        typewriter.close()
                        typewriter.stop()
                        break
                    }
                    case 'error': {
                        typewriter.close()
                        typewriter.stop(message.error)
                    }
                }
            }
        } catch (error: unknown) {
            typewriter.close()
            typewriter.stop(isAbortErrorOrSocketHangUp(error as Error) ? undefined : (error as Error))
        }
    }

    /**
     * Finalizes adding a bot message to the chat model and triggers an update to the view.
     */
    private addBotMessage(requestID: string, rawResponse: PromptString): void {
        const messageText = reformatBotMessageForChat(rawResponse)
        this.chatModel.addBotMessage({ text: messageText })
        void this.saveSession()
        this.postViewTranscript()

        const authStatus = this.authProvider.getAuthStatus()

        // Count code generated from response
        const generatedCode = countGeneratedCode(messageText.toString())
        const responseEventAction = generatedCode.charCount > 0 ? 'hasCode' : 'noCode'
        telemetryRecorder.recordEvent('cody.chatResponse', responseEventAction, {
            version: 2, // increment for major changes to this event
            interactionID: requestID,
            metadata: {
                ...generatedCode,
                // Flag indicating this is a transcript event to go through ML data pipeline. Only for dotcom users
                // See https://github.com/sourcegraph/sourcegraph/pull/59524
                recordsPrivateMetadataTranscript: authStatus.isDotCom ? 1 : 0,
            },
            privateMetadata: {
                // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                // V2 telemetry exports privateMetadata only for DotCom users
                // the condition below is an aditional safegaurd measure
                responseText:
                    authStatus.isDotCom && truncatePromptString(messageText, CHAT_OUTPUT_TOKEN_BUDGET),
                chatModel: this.chatModel.modelID,
            },
        })
    }

    // #endregion
    // =======================================================================
    // #region session management
    // =======================================================================

    // A unique identifier for this ChatController instance used to identify
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
        const oldTranscript = chatHistory.getChat(this.authProvider.getAuthStatus(), sessionID)
        if (!oldTranscript) {
            return this.newSession()
        }
        this.cancelSubmitOrEditOperation()
        const newModel = newChatModelFromSerializedChatTranscript(oldTranscript, this.chatModel.modelID)
        this.chatModel = newModel

        // Restore per-chat enhanced context settings
        if (this.remoteSearch) {
            const repos =
                this.chatModel.getSelectedRepos() || (await this.repoPicker?.getDefaultRepos()) || []
            this.remoteSearch.setRepos(repos, RepoInclusion.Manual)
        }

        this.postViewTranscript()
    }

    private async saveSession(): Promise<void> {
        const allHistory = await chatHistory.saveChat(
            this.authProvider.getAuthStatus(),
            this.chatModel.toSerializedChatTranscript()
        )
        if (allHistory) {
            void this.postMessage({
                type: 'history',
                localHistory: allHistory,
            })
        }
    }

    public async clearAndRestartSession(): Promise<void> {
        this.cancelSubmitOrEditOperation()
        await this.saveSession()

        this.chatModel = new ChatModel(this.chatModel.modelID)
        this.postViewTranscript()
    }

    // #endregion
    // =======================================================================
    // #region webview container management
    // =======================================================================

    private extensionUri: vscode.Uri
    private _webviewPanelOrView?: vscode.WebviewView | vscode.WebviewPanel
    public get webviewPanelOrView(): vscode.WebviewView | vscode.WebviewPanel | undefined {
        return this._webviewPanelOrView
    }

    /**
     * Creates the webview view or panel for the Cody chat interface if it doesn't already exist.
     */
    public async createWebviewViewOrPanel(
        activePanelViewColumn?: vscode.ViewColumn,
        lastQuestion?: string
    ): Promise<vscode.WebviewView | vscode.WebviewPanel> {
        // Checks if the webview view or panel already exists and is visible.
        // If so, returns early to avoid creating a duplicate.
        if (this.webviewPanelOrView) {
            return this.webviewPanelOrView
        }

        const viewType = CodyChatEditorViewType
        const panelTitle =
            chatHistory.getChat(this.authProvider.getAuthStatus(), this.chatModel.sessionID)
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
        logDebug('ChatController:revive', 'registering webview panel')
        await this.registerWebviewPanel(webviewPanel)
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): Promise<void> {
        await this.resolveWebviewViewOrPanel(webviewView)
    }

    /**
     * Registers the given webview panel by setting up its options, icon, and handlers.
     * Also stores the panel reference and disposes it when closed.
     */
    private async registerWebviewPanel(panel: vscode.WebviewPanel): Promise<vscode.WebviewPanel> {
        panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'active-chat-icon.svg')
        return this.resolveWebviewViewOrPanel(panel)
    }

    private async resolveWebviewViewOrPanel(viewOrPanel: vscode.WebviewView): Promise<vscode.WebviewView>
    private async resolveWebviewViewOrPanel(
        viewOrPanel: vscode.WebviewPanel
    ): Promise<vscode.WebviewPanel>
    private async resolveWebviewViewOrPanel(
        viewOrPanel: vscode.WebviewView | vscode.WebviewPanel
    ): Promise<vscode.WebviewView | vscode.WebviewPanel> {
        this._webviewPanelOrView = viewOrPanel
        this.syncPanelTitle()

        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        viewOrPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionUri, viewOrPanel)
        this.postContextStatus()

        // Dispose panel when the panel is closed
        viewOrPanel.onDidDispose(() => {
            this.cancelSubmitOrEditOperation()
            this._webviewPanelOrView = undefined
            if ('dispose' in viewOrPanel) {
                viewOrPanel.dispose()
            }
        })

        this.disposables.push(
            viewOrPanel.webview.onDidReceiveMessage(message =>
                this.onDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            )
        )

        // Listen for API calls from the webview.
        this.disposables.push(
            addMessageListenersForExtensionAPI(
                createMessageAPIForExtension({
                    postMessage: this.postMessage.bind(this),
                    postError: this.postError.bind(this),
                    onMessage: callback => {
                        const disposable = viewOrPanel.webview.onDidReceiveMessage(callback)
                        return () => disposable.dispose()
                    },
                }),
                {
                    mentionProviders: async function* (signal: AbortSignal) {
                        const isCodyWeb = (await getFullConfig()).agentIDE === CodyIDE.Web
                        const g = isCodyWeb
                            ? webMentionProvidersMetadata(signal)
                            : allMentionProvidersMetadata(signal)
                        for await (const value of g) {
                            yield value
                        }
                    },
                    contextItems: query =>
                        asyncGeneratorFromPromise(
                            this.handleGetUserContextFilesCandidates({ query }).then(
                                result => result.userContextFiles ?? []
                            )
                        ),
                    evaluatedFeatureFlag: (flag, signal) =>
                        featureFlagProvider.evaluatedFeatureFlag(flag, signal),
                    prompts: mergedPromptsAndLegacyCommands,
                }
            )
        )

        await this.postConfigFeatures()

        return viewOrPanel
    }

    private async postConfigFeatures(): Promise<void> {
        const clientConfig = await ClientConfigSingleton.getInstance().getConfig()
        void this.postMessage({
            type: 'setConfigFeatures',
            configFeatures: {
                // If clientConfig is undefined means we were unable to fetch the client configuration -
                // most likely because we are not authenticated yet. We need to be able to display the
                // chat panel (which is where all login functionality is) in this case, so we fallback
                // to some default values:
                chat: clientConfig?.chatEnabled ?? true,
                attribution: clientConfig?.attributionEnabled ?? false,
                serverSentModels: clientConfig?.modelsAPIEnabled ?? false,
            },
        })
    }

    public async setWebviewView(view: View): Promise<void> {
        if (view !== 'chat') {
            // Only chat view is supported in the webview panel.
            // When a different view is requested,
            // Set context to notify the webview panel to close.
            // This should close the webview panel and open the login view in the sidebar.
            await vscode.commands.executeCommand('setContext', 'cody.activated', false)
            return
        }
        const viewOrPanel = this._webviewPanelOrView ?? (await this.createWebviewViewOrPanel())

        this._webviewPanelOrView = viewOrPanel

        revealWebviewViewOrPanel(viewOrPanel)

        await this.postMessage({
            type: 'view',
            view: view,
        })
    }

    // #endregion
    // =======================================================================
    // #region other public accessors and mutators
    // =======================================================================

    // Convenience function for tests
    public getViewTranscript(): readonly ChatMessage[] {
        return this.chatModel.getMessages().map(prepareChatMessage)
    }

    public isEmpty(): boolean {
        return this.chatModel.isEmpty()
    }

    public isVisible(): boolean {
        return this.webviewPanelOrView?.visible ?? false
    }

    private async recordChatQuestionTelemetryEvent(
        authStatus: AuthStatus,
        legacyAddEnhancedContext: boolean,
        mentions: ContextItem[],
        sharedProperties: any,
        inputText: PromptString
    ): Promise<void> {
        const mentionsInInitialContext = mentions.filter(item => item.source !== ContextItemSource.User)
        const mentionsByUser = mentions.filter(item => item.source === ContextItemSource.User)
        telemetryRecorder.recordEvent('cody.chat-question', 'submitted', {
            metadata: {
                // Flag indicating this is a transcript event to go through ML data pipeline. Only for DotCom users
                // See https://github.com/sourcegraph/sourcegraph/pull/59524
                recordsPrivateMetadataTranscript: authStatus.endpoint && authStatus.isDotCom ? 1 : 0,
                addEnhancedContext: legacyAddEnhancedContext ? 1 : 0,

                // All mentions
                mentionsTotal: mentions.length,
                mentionsOfRepository: mentions.filter(item => item.type === 'repository').length,
                mentionsOfTree: mentions.filter(item => item.type === 'tree').length,
                mentionsOfWorkspaceRootTree: mentions.filter(
                    item => item.type === 'tree' && item.isWorkspaceRoot
                ).length,
                mentionsOfFile: mentions.filter(item => item.type === 'file').length,

                // Initial context mentions
                mentionsInInitialContext: mentionsInInitialContext.length,
                mentionsInInitialContextOfRepository: mentionsInInitialContext.filter(
                    item => item.type === 'repository'
                ).length,
                mentionsInInitialContextOfTree: mentionsInInitialContext.filter(
                    item => item.type === 'tree'
                ).length,
                mentionsInInitialContextOfWorkspaceRootTree: mentionsInInitialContext.filter(
                    item => item.type === 'tree' && item.isWorkspaceRoot
                ).length,
                mentionsInInitialContextOfFile: mentionsInInitialContext.filter(
                    item => item.type === 'file'
                ).length,

                // Explicit mentions by user
                mentionsByUser: mentionsByUser.length,
                mentionsByUserOfRepository: mentionsByUser.filter(item => item.type === 'repository')
                    .length,
                mentionsByUserOfTree: mentionsByUser.filter(item => item.type === 'tree').length,
                mentionsByUserOfWorkspaceRootTree: mentionsByUser.filter(
                    item => item.type === 'tree' && item.isWorkspaceRoot
                ).length,
                mentionsByUserOfFile: mentionsByUser.filter(item => item.type === 'file').length,
            },
            privateMetadata: {
                ...sharedProperties,
                // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                // V2 telemetry exports privateMetadata only for DotCom users
                // the condition below is an additional safeguard measure
                promptText:
                    authStatus.isDotCom && truncatePromptString(inputText, CHAT_INPUT_TOKEN_BUDGET),
                gitMetadata:
                    authStatus.isDotCom && legacyAddEnhancedContext
                        ? await this.getRepoMetadataIfPublic()
                        : '',
            },
        })
    }
}

function newChatModelFromSerializedChatTranscript(
    json: SerializedChatTranscript,
    modelID: string
): ChatModel {
    return new ChatModel(
        migrateAndNotifyForOutdatedModels(json.chatModel || modelID)!,
        json.id,
        json.interactions.flatMap((interaction: SerializedChatInteraction): ChatMessage[] =>
            [
                PromptString.unsafe_deserializeChatMessage(interaction.humanMessage),
                interaction.assistantMessage
                    ? PromptString.unsafe_deserializeChatMessage(interaction.assistantMessage)
                    : null,
            ].filter(isDefined)
        ),
        json.chatTitle,
        json.enhancedContext?.selectedRepos
    )
}

export function disposeWebviewViewOrPanel(viewOrPanel: vscode.WebviewView | vscode.WebviewPanel): void {
    if ('dispose' in viewOrPanel) {
        viewOrPanel.dispose()
    }
}

export function webviewViewOrPanelViewColumn(
    viewOrPanel: vscode.WebviewView | vscode.WebviewPanel
): vscode.ViewColumn | undefined {
    if ('viewColumn' in viewOrPanel) {
        return viewOrPanel.viewColumn
    }
    // Our view is in the sidebar, return undefined
    return undefined
}

export function webviewViewOrPanelOnDidChangeViewState(
    viewOrPanel: vscode.WebviewView | vscode.WebviewPanel
): vscode.Event<vscode.WebviewPanelOnDidChangeViewStateEvent> {
    if ('onDidChangeViewState' in viewOrPanel) {
        return viewOrPanel.onDidChangeViewState
    }
    // Return a no-op (this means the provider is for the sidebar)
    return () => {
        return {
            dispose: () => {},
        }
    }
}

export function revealWebviewViewOrPanel(viewOrPanel: vscode.WebviewView | vscode.WebviewPanel): void {
    if ('reveal' in viewOrPanel) {
        viewOrPanel.reveal()
    }
}

function getDefaultModelID(): string {
    const pending = ''
    try {
        return ModelsService.getDefaultChatModel() || pending
    } catch {
        return pending
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

import {
    type ChatModel,
    type ClientActionBroadcast,
    type CodyClientConfig,
    DefaultEditCommands,
    cenv,
    clientCapabilities,
    currentSiteVersion,
    distinctUntilChanged,
    firstResultFromOperation,
    forceHydration,
    pendingOperation,
    ps,
    resolvedConfig,
    shareReplay,
    skip,
    skipPendingOperation,
} from '@sourcegraph/cody-shared'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import {
    type BillingCategory,
    type BillingProduct,
    CHAT_OUTPUT_TOKEN_BUDGET,
    type ChatClient,
    type ChatMessage,
    ClientConfigSingleton,
    type CompletionParameters,
    type ContextItem,
    type ContextItemOpenCtx,
    ContextItemSource,
    DOTCOM_URL,
    type DefaultChatCommands,
    type EventSource,
    FeatureFlag,
    type Guardrails,
    type Message,
    ModelUsage,
    PromptString,
    type RankedContext,
    type SerializedChatInteraction,
    type SerializedChatTranscript,
    type SerializedPromptEditorState,
    Typewriter,
    addMessageListenersForExtensionAPI,
    authStatus,
    createMessageAPIForExtension,
    currentAuthStatus,
    currentAuthStatusAuthed,
    currentResolvedConfig,
    currentUserProductSubscription,
    featureFlagProvider,
    getContextForChatMessage,
    graphqlClient,
    hydrateAfterPostMessage,
    inputTextWithoutContextChipsFromPromptEditorState,
    isAbortError,
    isAbortErrorOrSocketHangUp,
    isContextWindowLimitError,
    isDefined,
    isDotCom,
    isError,
    isRateLimitError,
    logError,
    modelsService,
    promiseFactoryToObservable,
    recordErrorToSpan,
    reformatBotMessageForChat,
    serializeChatMessage,
    startWith,
    storeLastValue,
    subscriptionDisposable,
    telemetryEvents,
    telemetryRecorder,
    tracer,
    truncatePromptString,
    userProductSubscription,
} from '@sourcegraph/cody-shared'

import type { Span } from '@opentelemetry/api'
import { captureException } from '@sentry/core'
import { getTokenCounterUtils } from '@sourcegraph/cody-shared/src/token/counter'
import type { TelemetryEventParameters } from '@sourcegraph/telemetry'
import { Subject, map } from 'observable-fns'
import type { URI } from 'vscode-uri'
import { View } from '../../../webviews/tabs/types'
import { redirectToEndpointLogin, showSignInMenu, showSignOutMenu, signOut } from '../../auth/auth'
import {
    closeAuthProgressIndicator,
    startAuthProgressIndicator,
} from '../../auth/auth-progress-indicator'
import type { startTokenReceiver } from '../../auth/token-receiver'
import { executeCodyCommand } from '../../commands/CommandsController'
import { getContextFileFromUri } from '../../commands/context/file-path'
import { getContextFileFromCursor } from '../../commands/context/selection'
import { resolveContextItems } from '../../editor/utils/editor-context'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { ExtensionClient } from '../../extension-client'
import { migrateAndNotifyForOutdatedModels } from '../../models/modelMigrator'
import { logDebug } from '../../output-channel-logger'
import { getCategorizedMentions } from '../../prompt-builder/utils'
import { hydratePromptText } from '../../prompts/prompt-hydration'
import { mergedPromptsAndLegacyCommands } from '../../prompts/prompts'
import { publicRepoMetadataIfAllWorkspaceReposArePublic } from '../../repository/githubRepoMetadata'
import { authProvider } from '../../services/AuthProvider'
import { AuthProviderSimplified } from '../../services/AuthProviderSimplified'
import { localStorage } from '../../services/LocalStorageProvider'
import { secretStorage } from '../../services/SecretStorageProvider'
import { recordExposedExperimentsToSpan } from '../../services/open-telemetry/utils'
import {
    handleCodeFromInsertAtCursor,
    handleCodeFromSaveToNewFile,
    handleCopiedCode,
    handleSmartApply,
} from '../../services/utils/codeblock-action-tracker'
import { openExternalLinks } from '../../services/utils/workspace-action'
import { TestSupport } from '../../test-support'
import type { MessageErrorType } from '../MessageProvider'
import { CodyToolProvider } from '../agentic/CodyToolProvider'
import { DeepCodyAgent } from '../agentic/DeepCody'
import { getMentionMenuData } from '../context/chatContext'
import type { ChatIntentAPIClient } from '../context/chatIntentAPIClient'
import { observeDefaultContext } from '../initialContext'
import {
    CODY_BLOG_URL_o1_WAITLIST,
    type ConfigurationSubsetForWebview,
    type ExtensionMessage,
    type LocalEnv,
    type SmartApplyResult,
    type WebviewMessage,
} from '../protocol'
import { countGeneratedCode } from '../utils'
import { ChatBuilder, prepareChatMessage } from './ChatBuilder'
import { chatHistory } from './ChatHistoryManager'
import { CodyChatEditorViewType } from './ChatsController'
import { type ContextRetriever, toStructuredMentions } from './ContextRetriever'
import { InitDoer } from './InitDoer'
import { getChatPanelTitle } from './chat-helpers'
import { type HumanInput, getPriorityContext } from './context'
import { DefaultPrompter, type PromptInfo } from './prompt'
import { getPromptsMigrationInfo, startPromptsMigration } from './prompts-migration'

export interface ChatControllerOptions {
    extensionUri: vscode.Uri
    chatClient: Pick<ChatClient, 'chat'>

    contextRetriever: Pick<ContextRetriever, 'retrieveContext'>
    chatIntentAPIClient: ChatIntentAPIClient | null

    extensionClient: Pick<ExtensionClient, 'capabilities'>

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
    private chatBuilder: ChatBuilder

    private readonly chatClient: ChatControllerOptions['chatClient']

    private readonly contextRetriever: ChatControllerOptions['contextRetriever']
    private readonly toolProvider: CodyToolProvider

    private readonly editor: ChatControllerOptions['editor']
    private readonly extensionClient: ChatControllerOptions['extensionClient']
    private readonly guardrails: Guardrails

    private readonly startTokenReceiver: typeof startTokenReceiver | undefined
    private readonly chatIntentAPIClient: ChatIntentAPIClient | null

    private disposables: vscode.Disposable[] = []

    public readonly clientBroadcast = new Subject<ClientActionBroadcast>()

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
        this.featureCodyExperimentalOneBox.subscription.unsubscribe()
        this.disposables = []
    }

    constructor({
        extensionUri,
        chatClient,
        editor,
        guardrails,
        startTokenReceiver,
        chatIntentAPIClient,
        contextRetriever,
        extensionClient,
    }: ChatControllerOptions) {
        this.extensionUri = extensionUri
        this.chatClient = chatClient
        this.editor = editor
        this.extensionClient = extensionClient
        this.contextRetriever = contextRetriever
        this.toolProvider = CodyToolProvider.instance(this.contextRetriever)

        this.chatBuilder = new ChatBuilder(undefined)

        this.guardrails = guardrails
        this.startTokenReceiver = startTokenReceiver
        this.chatIntentAPIClient = chatIntentAPIClient

        if (TestSupport.instance) {
            TestSupport.instance.chatPanelProvider.set(this)
        }

        this.disposables.push(
            subscriptionDisposable(
                authStatus.subscribe(() => {
                    // Run this async because this method may be called during initialization
                    // and awaiting on this.postMessage may result in a deadlock
                    void this.sendConfig()
                })
            ),

            // Reset the chat when the endpoint changes so that we don't try to use old models.
            subscriptionDisposable(
                authStatus
                    .pipe(
                        map(authStatus => authStatus.endpoint),
                        distinctUntilChanged(),
                        // Skip the initial emission (which occurs immediately upon subscription)
                        // because we only want to reset it when it changes after the ChatController
                        // has been in use. If we didn't have `skip(1)`, then `new
                        // ChatController().restoreSession(...)` usage would break because we would
                        // immediately overwrite the just-restored chat.
                        skip(1)
                    )
                    .subscribe(() => {
                        this.chatBuilder = new ChatBuilder(undefined)
                    })
            )
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
                this.setWebviewToChat()
                break
            case 'submit': {
                await this.handleUserMessageSubmission({
                    requestID: uuid.v4(),
                    inputText: PromptString.unsafe_fromUserQuery(message.text),
                    mentions: message.contextItems ?? [],
                    editorState: message.editorState as SerializedPromptEditorState,
                    signal: this.startNewSubmitOrEditOperation(),
                    source: 'chat',
                    intent: message.intent,
                    intentScores: message.intentScores,
                    manuallySelectedIntent: message.manuallySelectedIntent,
                })
                break
            }
            case 'edit': {
                await this.handleEdit({
                    requestID: uuid.v4(),
                    text: PromptString.unsafe_fromUserQuery(message.text),
                    index: message.index ?? undefined,
                    contextFiles: message.contextItems ?? [],
                    editorState: message.editorState as SerializedPromptEditorState,
                    intent: message.intent,
                    intentScores: message.intentScores,
                    manuallySelectedIntent: message.manuallySelectedIntent,
                })
                break
            }
            case 'abort':
                this.handleAbort()
                break
            case 'insert':
                await handleCodeFromInsertAtCursor(message.text)
                break
            case 'copy':
                await handleCopiedCode(message.text, message.eventType === 'Button')
                break
            case 'smartApplySubmit':
                await handleSmartApply(
                    message.id,
                    message.code,
                    currentAuthStatus(),
                    message.instruction,
                    message.fileName
                )
                break
            case 'smartApplyAccept':
                await vscode.commands.executeCommand('cody.fixup.codelens.accept', message.id)
                break
            case 'smartApplyReject':
                await vscode.commands.executeCommand('cody.fixup.codelens.undo', message.id)
                break
            case 'openURI':
                vscode.commands.executeCommand('vscode.open', message.uri)
                break
            case 'links': {
                let link = message.value
                if (message.value === 'waitlist') {
                    const authStatus = currentAuthStatusAuthed()
                    const waitlistURI = CODY_BLOG_URL_o1_WAITLIST
                    waitlistURI.searchParams.append('userId', authStatus?.username)
                    link = waitlistURI.toString()
                    void joinModelWaitlist()
                }
                void openExternalLinks(link)
                break
            }
            case 'openFileLink':
                vscode.commands.executeCommand('vscode.open', message.uri, {
                    selection: message.range,
                    preserveFocus: true,
                    background: false,
                    preview: true,
                    viewColumn: vscode.ViewColumn.Beside,
                })
                break
            case 'newFile':
                await handleCodeFromSaveToNewFile(message.text, this.editor)
                break
            case 'show-page':
                await vscode.commands.executeCommand('cody.show-page', message.page)
                break
            case 'attribution-search':
                await this.handleAttributionSearch(message.snippet)
                break
            case 'restoreHistory':
                this.restoreSession(message.chatID)
                this.setWebviewToChat()
                break
            case 'chatSession':
                switch (message.action) {
                    case 'new':
                        await this.clearAndRestartSession()
                        break
                    case 'duplicate':
                        await this.duplicateSession(message.sessionID ?? this.chatBuilder.sessionID)
                        break
                }
                break
            case 'command':
                vscode.commands.executeCommand(message.id, message.arg)
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
                    redirectToEndpointLogin(message.endpoint)
                    break
                }
                if (message.authKind === 'simplified-onboarding') {
                    const endpoint = DOTCOM_URL.href

                    let tokenReceiverUrl: string | undefined = undefined
                    closeAuthProgressIndicator()
                    startAuthProgressIndicator()
                    tokenReceiverUrl = await this.startTokenReceiver?.(endpoint, async credentials => {
                        closeAuthProgressIndicator()
                        const {
                            authStatus: { authenticated },
                        } = await authProvider.validateAndStoreCredentials(credentials, 'store-if-valid')
                        telemetryRecorder.recordEvent('cody.auth.fromTokenReceiver.web', 'succeeded', {
                            metadata: {
                                success: authenticated ? 1 : 0,
                            },
                            billingMetadata: {
                                product: 'cody',
                                category: 'billable',
                            },
                        })
                        if (!authenticated) {
                            void vscode.window.showErrorMessage(
                                'Authentication failed. Please check your token and try again.'
                            )
                        }
                    })

                    const authProviderSimplified = new AuthProviderSimplified()
                    const authMethod = message.authMethod || 'dotcom'
                    const successfullyOpenedUrl = await authProviderSimplified.openExternalAuthUrl(
                        authMethod,
                        tokenReceiverUrl
                    )
                    if (!successfullyOpenedUrl) {
                        closeAuthProgressIndicator()
                    }
                    break
                }
                if (message.authKind === 'signin' && message.endpoint) {
                    const serverEndpoint = message.endpoint
                    const accessToken = message.value
                        ? message.value
                        : await secretStorage.getToken(serverEndpoint)
                    if (accessToken) {
                        const tokenSource = message.value
                            ? 'paste'
                            : await secretStorage.getTokenSource(serverEndpoint)
                        const validationResult = await authProvider.validateAndStoreCredentials(
                            { serverEndpoint, accessToken, tokenSource },
                            'always-store'
                        )
                        if (validationResult.authStatus.authenticated) {
                            break
                        }
                    } else {
                        redirectToEndpointLogin(message.endpoint)
                    }
                    break
                }
                if (message.authKind === 'signout') {
                    const serverEndpoint = message.endpoint
                    if (serverEndpoint) {
                        await signOut(serverEndpoint)
                    } else {
                        await showSignOutMenu()
                    }
                    break
                }
                if (message.authKind === 'switch') {
                    await showSignInMenu()
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
                            const {
                                authStatus: { authenticated },
                            } = await authProvider.validateAndStoreCredentials(
                                {
                                    serverEndpoint: DOTCOM_URL.href,
                                    accessToken: token,
                                },
                                'store-if-valid'
                            )
                            if (!authenticated) {
                                void vscode.window.showErrorMessage(
                                    'Authentication failed. Please check your token and try again.'
                                )
                            }
                        })
                    break
                }
                break
            }
            case 'log': {
                const logger = message.level === 'debug' ? logDebug : logError
                logger(message.filterLabel, message.message)
                break
            }
        }
    }

    private isSmartApplyEnabled(): boolean {
        return this.extensionClient.capabilities?.edit !== 'none'
    }

    private hasEditCapability(): boolean {
        return this.extensionClient.capabilities?.edit === 'enabled'
    }

    private featureCodyExperimentalOneBox = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyExperimentalOneBox)
    )

    private async getConfigForWebview(): Promise<ConfigurationSubsetForWebview & LocalEnv> {
        const { configuration, auth } = await currentResolvedConfig()
        const sidebarViewOnly = this.extensionClient.capabilities?.webviewNativeConfig?.view === 'single'
        const isEditorViewType = this.webviewPanelOrView?.viewType === 'cody.editorPanel'
        const webviewType = isEditorViewType && !sidebarViewOnly ? 'editor' : 'sidebar'
        const uiKindIsWeb = (cenv.CODY_OVERRIDE_UI_KIND ?? vscode.env.uiKind) === vscode.UIKind.Web
        const endpoints = localStorage.getEndpointHistory() ?? []

        return {
            uiKindIsWeb,
            serverEndpoint: auth.serverEndpoint,
            endpointHistory: [...endpoints],
            experimentalNoodle: configuration.experimentalNoodle,
            smartApply: this.isSmartApplyEnabled(),
            hasEditCapability: this.hasEditCapability(),
            webviewType,
            multipleWebviewsEnabled: !sidebarViewOnly,
            internalDebugContext: configuration.internalDebugContext,
        }
    }

    // =======================================================================
    // #region top-level view action handlers
    // =======================================================================

    // When the webview sends the 'ready' message, respond by posting the view config
    private async handleReady(): Promise<void> {
        await this.sendConfig()
    }

    private async sendConfig(): Promise<void> {
        const authStatus = currentAuthStatus()

        // Don't emit config if we're verifying auth status to avoid UI auth flashes on the client
        if (authStatus.pendingValidation) {
            return
        }

        const configForWebview = await this.getConfigForWebview()
        const workspaceFolderUris =
            vscode.workspace.workspaceFolders?.map(folder => folder.uri.toString()) ?? []

        const abortController = new AbortController()
        let clientConfig: CodyClientConfig | undefined
        try {
            clientConfig = await ClientConfigSingleton.getInstance().getConfig(abortController.signal)
            if (abortController.signal.aborted) {
                return
            }
        } catch (error) {
            if (isAbortError(error) || abortController.signal.aborted) {
                return
            }
            throw error
        }

        await this.postMessage({
            type: 'config',
            config: configForWebview,
            clientCapabilities: clientCapabilities(),
            authStatus: authStatus,
            userProductSubscription: await currentUserProductSubscription(),
            workspaceFolderUris,
            configFeatures: {
                // If clientConfig is undefined means we were unable to fetch the client configuration -
                // most likely because we are not authenticated yet. We need to be able to display the
                // chat panel (which is where all login functionality is) in this case, so we fallback
                // to some default values:
                chat: clientConfig?.chatEnabled ?? true,
                attribution: clientConfig?.attributionEnabled ?? false,
                serverSentModels: clientConfig?.modelsAPIEnabled ?? false,
            },
            isDotComUser: isDotCom(authStatus),
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
            chatID: this.chatBuilder.sessionID,
        })

        await this.saveSession()
        this.initDoer.signalInitialized()
    }

    /**
     * Handles user input text for both new and edit submissions
     */
    public async handleUserMessageSubmission({
        requestID,
        inputText,
        mentions,
        editorState,
        signal,
        source,
        command,
        intent: detectedIntent,
        intentScores: detectedIntentScores,
        manuallySelectedIntent,
    }: {
        requestID: string
        inputText: PromptString
        mentions: ContextItem[]
        editorState: SerializedPromptEditorState | null
        signal: AbortSignal
        source?: EventSource
        command?: DefaultChatCommands
        intent?: ChatMessage['intent'] | undefined | null
        intentScores?: { intent: string; score: number }[] | undefined | null
        manuallySelectedIntent?: boolean | undefined | null
    }): Promise<void> {
        return tracer.startActiveSpan('chat.submit', async (span): Promise<void> => {
            span.setAttribute('sampled', true)

            if (inputText.toString().match(/^\/reset$/)) {
                span.addEvent('clearAndRestartSession')
                span.end()
                return this.clearAndRestartSession()
            }

            this.chatBuilder.addHumanMessage({
                text: inputText,
                editorState,
                intent: detectedIntent,
            })
            this.postViewTranscript({ speaker: 'assistant' })

            await this.saveSession()
            signal.throwIfAborted()

            return this.sendChat(
                {
                    requestID,
                    inputText,
                    mentions,
                    editorState,
                    signal,
                    source,
                    command,
                    intent: detectedIntent,
                    intentScores: detectedIntentScores,
                    manuallySelectedIntent,
                },
                span
            )
        })
    }

    public async sendChat(
        {
            requestID,
            inputText,
            mentions,
            editorState,
            signal,
            source,
            command,
            intent: detectedIntent,
            intentScores: detectedIntentScores,
            manuallySelectedIntent,
        }: Parameters<typeof this.handleUserMessageSubmission>[0],
        span: Span
    ): Promise<void> {
        const authStatus = currentAuthStatusAuthed()

        // Use default model if no model is selected.
        const model = await firstResultFromOperation(ChatBuilder.resolvedModelForChat(this.chatBuilder))
        if (!model) {
            throw new Error('No model selected, and no default chat model is available')
        }
        this.chatBuilder.setSelectedModel(model)
        const { isPublic: repoIsPublic, repoMetadata } = await firstResultFromOperation(
            publicRepoMetadataIfAllWorkspaceReposArePublic
        )

        const telemetryProperties = {
            requestID,
            chatModel: model,
            authStatus,
            source,
            command,
            sessionID: this.chatBuilder.sessionID,
            repoMetadata,
            repoIsPublic,
            traceId: span.spanContext().traceId,
            promptText: inputText,
        } as const
        const tokenCounterUtils = await getTokenCounterUtils()

        telemetryEvents['cody.chat-question/submitted'].record(
            {
                ...telemetryProperties,
                mentions,
            },
            tokenCounterUtils
        )

        await tracer.startActiveSpan('chat.submit.firstToken', async (firstTokenSpan): Promise<void> => {
            this.postEmptyMessageInProgress(model)

            // All mentions we receive are either source=initial or source=user. If the caller
            // forgot to set the source, assume it's from the user.
            mentions = mentions.map(m => (m.source ? m : { ...m, source: ContextItemSource.User }))

            const contextAlternatives = await this.computeContext(
                { text: inputText, mentions },
                requestID,
                editorState,
                span,
                signal
            )
            signal.throwIfAborted()
            const corpusContext = contextAlternatives[0].items

            const inputTextWithoutContextChips = editorState
                ? PromptString.unsafe_fromUserQuery(
                      inputTextWithoutContextChipsFromPromptEditorState(editorState)
                  )
                : inputText

            const repositoryMentioned = mentions.find(contextItem =>
                ['repository', 'tree'].includes(contextItem.type)
            )

            // We are checking the feature flag here to log non-undefined intent only if the feature flag is on
            let intent: ChatMessage['intent'] | undefined = this.featureCodyExperimentalOneBox
                ? detectedIntent
                : undefined

            let intentScores: { intent: string; score: number }[] | undefined | null = this
                .featureCodyExperimentalOneBox
                ? detectedIntentScores
                : undefined

            const userSpecifiedIntent =
                manuallySelectedIntent && detectedIntent
                    ? detectedIntent
                    : this.featureCodyExperimentalOneBox
                      ? 'auto'
                      : 'chat'

            const finalIntentDetectionResponse = detectedIntent
                ? { intent: detectedIntent, allScores: detectedIntentScores }
                : this.featureCodyExperimentalOneBox && repositoryMentioned
                  ? await this.detectChatIntent({
                        requestID,
                        text: inputTextWithoutContextChips.toString(),
                    })
                        .then(async response => {
                            signal.throwIfAborted()
                            this.chatBuilder.setLastMessageIntent(response?.intent)
                            this.postEmptyMessageInProgress(model)
                            return response
                        })
                        .catch(() => undefined)
                  : undefined

            intent = finalIntentDetectionResponse?.intent
            intentScores = finalIntentDetectionResponse?.allScores
            signal.throwIfAborted()

            if (['search', 'edit', 'insert'].includes(intent || '')) {
                telemetryEvents['cody.chat-question/executed'].record(
                    {
                        ...telemetryProperties,
                        context: corpusContext,
                        userSpecifiedIntent,
                        detectedIntent: intent,
                        detectedIntentScores: intentScores,
                    },
                    { current: span, firstToken: firstTokenSpan, addMetadata: true },
                    tokenCounterUtils
                )
            }

            if (intent === 'edit' || intent === 'insert') {
                return await this.handleEditMode({
                    requestID,
                    mode: intent,
                    instruction: inputTextWithoutContextChips,
                    context: corpusContext,
                    signal,
                    contextAlternatives,
                })
            }

            if (intent === 'search') {
                return await this.handleSearchIntent({
                    context: corpusContext,
                    signal,
                    contextAlternatives,
                })
            }

            // Experimental Feature: Deep Cody
            if (model?.includes('deep-cody')) {
                const agenticContext = await new DeepCodyAgent(
                    this.chatBuilder,
                    this.chatClient,
                    await this.toolProvider.getTools(),
                    corpusContext
                ).getContext(span, signal)
                corpusContext.push(...agenticContext)
            }

            const { explicitMentions, implicitMentions } = getCategorizedMentions(corpusContext)

            const prompter = new DefaultPrompter(
                explicitMentions,
                implicitMentions,
                command !== undefined
            )

            try {
                const versions = await currentSiteVersion()
                if (!versions) {
                    throw new Error('unable to determine site version')
                }
                const { prompt, context } = await this.buildPrompt(
                    prompter,
                    signal,
                    requestID,
                    versions.codyAPIVersion,
                    contextAlternatives
                )

                telemetryEvents['cody.chat-question/executed'].record(
                    {
                        ...telemetryProperties,
                        context,
                        userSpecifiedIntent,
                        detectedIntent: intent,
                        detectedIntentScores: intentScores,
                    },
                    {
                        addMetadata: true,
                        current: span,
                        firstToken: firstTokenSpan,
                    },
                    tokenCounterUtils
                )

                signal.throwIfAborted()
                this.streamAssistantResponse(requestID, prompt, model, span, firstTokenSpan, signal)
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
    }

    private async detectChatIntent({
        requestID,
        text,
    }: { requestID?: string; text: string }): Promise<
        { intent: ChatMessage['intent']; allScores: { intent: string; score: number }[] } | undefined
    > {
        const response = await this.chatIntentAPIClient
            ?.detectChatIntent(requestID || '', text)
            .catch(() => null)

        if (response && !isError(response)) {
            return {
                intent: response.intent === 'search' ? 'search' : 'chat',
                allScores: response.allScores || [],
            }
        }

        return
    }

    private async handleSearchIntent({
        context,
        signal,
        contextAlternatives,
    }: {
        context: ContextItem[]
        signal: AbortSignal
        contextAlternatives: RankedContext[]
    }): Promise<void> {
        signal.throwIfAborted()

        this.chatBuilder.setLastMessageContext(context, contextAlternatives)
        this.chatBuilder.setLastMessageIntent('search')
        this.chatBuilder.addBotMessage(
            {
                text: ps`"cody-experimental-one-box" feature flag is turned on.`,
            },
            ChatBuilder.NO_MODEL
        )

        void this.saveSession()
        this.postViewTranscript()
    }

    private async handleEditMode({
        requestID,
        mode,
        instruction,
        context,
        signal,
        contextAlternatives,
    }: {
        requestID: string
        instruction: PromptString
        mode: 'edit' | 'insert'
        context: ContextItem[]
        signal: AbortSignal
        contextAlternatives: RankedContext[]
    }): Promise<void> {
        signal.throwIfAborted()

        this.chatBuilder.setLastMessageContext(context, contextAlternatives)
        this.chatBuilder.setLastMessageIntent(mode)

        const result = await executeCodyCommand(DefaultEditCommands.Edit, {
            requestID,
            runInChatMode: true,
            userContextFiles: context,
            configuration: {
                instruction,
                mode,
                intent: mode === 'edit' ? 'edit' : 'add',
            },
        })

        if (result?.type !== 'edit' || !result.task) {
            this.postError(new Error('Failed to execute edit command'), 'transcript')
            return
        }

        const task = result.task

        let responseMessage = `Here is the response for the ${task.intent} instruction:\n`
        task.diff?.map(diff => {
            responseMessage += '\n```diff\n'
            if (diff.type === 'deletion') {
                responseMessage += task.document
                    .getText(diff.range)
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
            }
            if (diff.type === 'decoratedReplacement') {
                responseMessage += diff.oldText
                    .split('\n')
                    .map(line => `- ${line}`)
                    .join('\n')
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            if (diff.type === 'insertion') {
                responseMessage += diff.text
                    .split('\n')
                    .map(line => `+ ${line}`)
                    .join('\n')
            }
            responseMessage += '\n```'
        })

        this.chatBuilder.addBotMessage(
            {
                text: ps`${PromptString.unsafe_fromLLMResponse(responseMessage)}`,
            },
            this.chatBuilder.selectedModel || ChatBuilder.NO_MODEL
        )

        void this.saveSession()
        this.postViewTranscript()
    }

    private async computeContext(
        { text, mentions }: HumanInput,
        requestID: string,
        editorState: SerializedPromptEditorState | null,
        span: Span,
        signal?: AbortSignal
    ): Promise<RankedContext[]> {
        try {
            return await this._computeContext({ text, mentions }, requestID, editorState, span, signal)
        } catch (e) {
            this.postError(new Error(`Unexpected error computing context, no context was used: ${e}`))
            return [
                {
                    strategy: 'none',
                    items: [],
                },
            ]
        }
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
        const priorityContextPromise = retrievedContextPromise
            .then(p => getPriorityContext(text, this.editor, p))
            .catch(() => getPriorityContext(text, this.editor, []))
        const openCtxContextPromise = getContextForChatMessage(text.toString(), signal)
        const [priorityContext, retrievedContext, openCtxContext] = await Promise.all([
            priorityContextPromise,
            retrievedContextPromise.catch(e => {
                this.postError(new Error(`Failed to retrieve search context: ${e}`))
                return []
            }),
            openCtxContextPromise,
        ])

        const resolvedExplicitMentionsPromise = resolveContextItems(
            this.editor,
            [structuredMentions.symbols, structuredMentions.files, structuredMentions.openCtx].flat(),
            text,
            signal
        )

        return [
            {
                strategy: 'local+remote',
                items: combineContext(
                    await resolvedExplicitMentionsPromise,
                    openCtxContext,
                    priorityContext,
                    retrievedContext
                ),
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
        this.saveSession()
    }

    /**
     * Handles editing a human chat message in current chat session.
     *
     * Removes any existing messages from the provided index,
     * before submitting the replacement text as a new question.
     * When no index is provided, default to the last human message.
     *
     * @internal Public for testing only.
     */
    public async handleEdit({
        requestID,
        text,
        index,
        contextFiles,
        editorState,
        intent,
        intentScores,
        manuallySelectedIntent,
    }: {
        requestID: string
        text: PromptString
        index: number | undefined
        contextFiles: ContextItem[]
        editorState: SerializedPromptEditorState | null
        intent?: ChatMessage['intent'] | undefined | null
        intentScores?: { intent: string; score: number }[] | undefined | null
        manuallySelectedIntent?: boolean | undefined | null
    }): Promise<void> {
        const abortSignal = this.startNewSubmitOrEditOperation()

        telemetryRecorder.recordEvent('cody.editChatButton', 'clicked', {
            billingMetadata: {
                product: 'cody',
                category: 'billable',
            },
        })

        try {
            const humanMessage = index ?? this.chatBuilder.getLastSpeakerMessageIndex('human')
            if (humanMessage === undefined) {
                return
            }
            this.chatBuilder.removeMessagesFromIndex(humanMessage, 'human')
            return await this.handleUserMessageSubmission({
                requestID,
                inputText: text,
                mentions: contextFiles,
                editorState,
                signal: abortSignal,
                source: 'chat',
                intent,
                intentScores,
                manuallySelectedIntent,
            })
        } catch {
            this.postError(new Error('Failed to edit prompt'), 'transcript')
        }
    }

    private handleAbort(): void {
        this.cancelSubmitOrEditOperation()
        // Notify the webview there is no message in progress.
        this.postViewTranscript()
        telemetryRecorder.recordEvent('cody.sidebar.abortButton', 'clicked', {
            billingMetadata: {
                category: 'billable',
                product: 'cody',
            },
        })
    }

    public async addContextItemsToLastHumanInput(
        contextItems: ContextItem[]
    ): Promise<boolean | undefined> {
        return this.postMessage({
            type: 'clientAction',
            addContextItemsToLastHumanInput: contextItems,
        })
    }

    public async handleGetUserEditorContext(uri?: URI): Promise<void> {
        // Get selection from the active editor
        const selection = vscode.window.activeTextEditor?.selection

        // Determine context based on URI presence
        const contextItem = uri
            ? await getContextFileFromUri(uri, selection)
            : await getContextFileFromCursor()

        const { input, context } = await firstResultFromOperation(
            ChatBuilder.contextWindowForChat(this.chatBuilder)
        )
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

    public async handleResubmitLastUserInput(): Promise<void> {
        const lastHumanMessage = this.chatBuilder.getLastHumanMessage()
        const getLastHumanMessageText = lastHumanMessage?.text?.toString()
        if (getLastHumanMessageText) {
            await this.clearAndRestartSession()
            void this.postMessage({
                type: 'clientAction',
                appendTextToLastPromptEditor: getLastHumanMessageText,
            })
        }
    }

    public async handleSmartApplyResult(result: SmartApplyResult): Promise<void> {
        void this.postMessage({
            type: 'clientAction',
            smartApplyResult: result,
        })
    }

    public fireClientAction(): void {}

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

    // #endregion
    // =======================================================================
    // #region view updaters
    // =======================================================================

    private postEmptyMessageInProgress(model: ChatModel): void {
        this.postViewTranscript({ speaker: 'assistant', model })
    }

    private postViewTranscript(messageInProgress?: ChatMessage): void {
        const messages: ChatMessage[] = [...this.chatBuilder.getMessages()]
        if (messageInProgress) {
            messages.push(messageInProgress)
        }

        // We never await on postMessage, because it can sometimes hang indefinitely:
        // https://github.com/microsoft/vscode/issues/159431
        void this.postMessage({
            type: 'transcript',
            messages: messages.map(prepareChatMessage).map(serializeChatMessage),
            isMessageInProgress: !!messageInProgress,
            chatID: this.chatBuilder.sessionID,
        })

        this.syncPanelTitle()
    }

    private syncPanelTitle() {
        // Update webview panel title if we're in an editor panel
        if (this._webviewPanelOrView && 'reveal' in this._webviewPanelOrView) {
            this._webviewPanelOrView.title = this.chatBuilder.getChatTitle()
        }
    }

    /**
     * Display error message in webview as part of the chat transcript, or as a system banner alongside the chat.
     */
    private postError(error: Error, type?: MessageErrorType): void {
        logDebug('ChatController: postError', error.message)
        // Add error to transcript
        if (type === 'transcript') {
            this.chatBuilder.addErrorAsBotMessage(error, ChatBuilder.NO_MODEL)
            this.postViewTranscript()
            return
        }

        void this.postMessage({ type: 'errors', errors: error.message })
        captureException(error)
    }

    /**
     * Low-level utility to post a message to the webview, pending initialization.
     *
     * cody-invariant: this.webview.postMessage should never be invoked directly
     * except within this method.
     */
    private postMessage(message: ExtensionMessage): Thenable<boolean | undefined> {
        return this.initDoer.do(() =>
            this.webviewPanelOrView?.webview.postMessage(forceHydration(message))
        )
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
        codyApiVersion: number,
        contextAlternatives?: RankedContext[]
    ): Promise<PromptInfo> {
        const { prompt, context } = await prompter.makePrompt(this.chatBuilder, codyApiVersion)
        abortSignal.throwIfAborted()

        // Update UI based on prompt construction. Includes the excluded context items to display in the UI
        this.chatBuilder.setLastMessageContext(
            [...context.used, ...context.ignored],
            contextAlternatives
        )

        return { prompt, context }
    }

    private streamAssistantResponse(
        requestID: string,
        prompt: Message[],
        model: ChatModel,
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
        this.postEmptyMessageInProgress(model)
        this.sendLLMRequest(
            prompt,
            model,
            {
                update: content => {
                    measureFirstToken()
                    span.addEvent('update')
                    this.postViewTranscript({
                        speaker: 'assistant',
                        text: PromptString.unsafe_fromLLMResponse(content),
                        model,
                    })
                },
                close: content => {
                    measureFirstToken()
                    recordExposedExperimentsToSpan(span)
                    span.end()
                    this.addBotMessage(requestID, PromptString.unsafe_fromLLMResponse(content), model)
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
                            PromptString.unsafe_fromLLMResponse(partialResponse),
                            model
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
        model: ChatModel,
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
            const contextWindow = await firstResultFromOperation(
                ChatBuilder.contextWindowForChat(this.chatBuilder)
            )

            const params = {
                model,
                maxTokensToSample: contextWindow.output,
            } as CompletionParameters

            // Set stream param only when the model is disabled for streaming.
            if (model && modelsService.isStreamDisabled(model)) {
                params.stream = false
            }

            const stream = await this.chatClient.chat(prompt, params, abortSignal)
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
    private async addBotMessage(
        requestID: string,
        rawResponse: PromptString,
        model: ChatModel
    ): Promise<void> {
        const messageText = reformatBotMessageForChat(rawResponse)
        this.chatBuilder.addBotMessage({ text: messageText }, model)
        void this.saveSession()
        this.postViewTranscript()

        const authStatus = currentAuthStatus()

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
                recordsPrivateMetadataTranscript: isDotCom(authStatus) ? 1 : 0,
            },
            privateMetadata: {
                // 🚨 SECURITY: chat transcripts are to be included only for DotCom users AND for V2 telemetry
                // V2 telemetry exports privateMetadata only for DotCom users
                // the condition below is an aditional safegaurd measure
                responseText:
                    isDotCom(authStatus) &&
                    (await truncatePromptString(messageText, CHAT_OUTPUT_TOKEN_BUDGET)),
                chatModel: model,
            },
            billingMetadata: {
                product: 'cody',
                category: 'billable',
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
        return this.chatBuilder.sessionID
    }

    // Attempts to restore the chat to the given sessionID, if it exists in
    // history. If it does, then saves the current session and cancels the
    // current in-progress completion. If the chat does not exist, then this
    // is a no-op.
    public restoreSession(sessionID: string): void {
        const authStatus = currentAuthStatus()
        if (!authStatus.authenticated) {
            return
        }
        const oldTranscript = chatHistory.getChat(authStatus, sessionID)
        if (!oldTranscript) {
            return
        }
        this.cancelSubmitOrEditOperation()
        const newModel = newChatModelFromSerializedChatTranscript(oldTranscript, undefined)
        this.chatBuilder = newModel

        this.postViewTranscript()
    }

    private async saveSession(): Promise<void> {
        const authStatus = currentAuthStatus()
        if (authStatus.authenticated) {
            // Only try to save if authenticated because otherwise we wouldn't be showing a chat.
            const chat = this.chatBuilder.toSerializedChatTranscript()
            if (chat) {
                await chatHistory.saveChat(authStatus, chat)
            }
        }
    }

    private async duplicateSession(sessionID: string): Promise<void> {
        this.cancelSubmitOrEditOperation()
        const transcript = chatHistory.getChat(currentAuthStatusAuthed(), sessionID)
        if (!transcript) {
            return
        }
        // Assign a new session ID to the duplicated session
        this.chatBuilder = newChatModelFromSerializedChatTranscript(
            transcript,
            this.chatBuilder.selectedModel,
            new Date(Date.now()).toUTCString()
        )
        this.postViewTranscript()
        await this.saveSession()
        // Move the new session to the editor
        await vscode.commands.executeCommand('cody.chat.moveToEditor')
        // Restore the old session in the current window
        this.restoreSession(sessionID)

        telemetryRecorder.recordEvent('cody.duplicateSession', 'clicked')
    }

    public async clearAndRestartSession(chatMessages?: ChatMessage[]): Promise<void> {
        this.cancelSubmitOrEditOperation()
        await this.saveSession()

        this.chatBuilder = new ChatBuilder(this.chatBuilder.selectedModel, undefined, chatMessages)
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
            chatHistory.getChat(currentAuthStatusAuthed(), this.chatBuilder.sessionID)?.chatTitle ||
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

    private async resolveWebviewViewOrPanel<T extends vscode.WebviewView | vscode.WebviewPanel>(
        viewOrPanel: T
    ): Promise<T> {
        this._webviewPanelOrView = viewOrPanel
        this.syncPanelTitle()

        const webviewPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webviews')
        viewOrPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [webviewPath],
            enableCommandUris: true,
        }

        await addWebviewViewHTML(this.extensionClient, this.extensionUri, viewOrPanel)

        // Dispose panel when the panel is closed
        viewOrPanel.onDidDispose(() => {
            this.cancelSubmitOrEditOperation()
            this._webviewPanelOrView = undefined
        })

        this.disposables.push(
            viewOrPanel.webview.onDidReceiveMessage(message =>
                this.onDidReceiveMessage(
                    hydrateAfterPostMessage(message, uri => vscode.Uri.from(uri as any))
                )
            )
        )

        // Listen for API calls from the webview.
        const defaultContext = observeDefaultContext({
            chatBuilder: this.chatBuilder.changes,
        }).pipe(shareReplay())

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
                    mentionMenuData: query => {
                        return getMentionMenuData({
                            disableProviders:
                                this.extensionClient.capabilities?.disabledMentionsProviders || [],
                            query: query,
                            chatBuilder: this.chatBuilder,
                        })
                    },
                    clientActionBroadcast: () => this.clientBroadcast,
                    evaluatedFeatureFlag: flag => featureFlagProvider.evaluatedFeatureFlag(flag),
                    hydratePromptMessage: (promptText, initialContext) =>
                        promiseFactoryToObservable(() =>
                            hydratePromptText(promptText, initialContext ?? [])
                        ),
                    promptsMigrationStatus: () => getPromptsMigrationInfo(),
                    startPromptsMigration: () => promiseFactoryToObservable(startPromptsMigration),
                    prompts: input =>
                        promiseFactoryToObservable(signal =>
                            mergedPromptsAndLegacyCommands(input, signal)
                        ),
                    models: () =>
                        modelsService.modelsChanges.pipe(
                            map(models => (models === pendingOperation ? null : models))
                        ),
                    chatModels: () =>
                        modelsService.getModels(ModelUsage.Chat).pipe(
                            startWith([]),
                            map(models => (models === pendingOperation ? [] : models))
                        ),
                    highlights: parameters =>
                        promiseFactoryToObservable(() =>
                            graphqlClient.getHighlightedFileChunk(parameters)
                        ).pipe(
                            map(result => {
                                if (isError(result)) {
                                    return []
                                }

                                return result
                            })
                        ),
                    setChatModel: model => {
                        // Because this was a user action to change the model we will set that
                        // as a global default for chat
                        return promiseFactoryToObservable(async () => {
                            this.chatBuilder.setSelectedModel(model)
                            await modelsService.setSelectedModel(ModelUsage.Chat, model)
                        })
                    },
                    defaultContext: () => defaultContext.pipe(skipPendingOperation()),
                    detectIntent: text =>
                        promiseFactoryToObservable<
                            | {
                                  intent: ChatMessage['intent']
                                  allScores: { intent: string; score: number }[]
                              }
                            | undefined
                        >(() => this.detectChatIntent({ text })),
                    resolvedConfig: () => resolvedConfig,
                    authStatus: () => authStatus,
                    transcript: () =>
                        this.chatBuilder.changes.pipe(map(chat => chat.getDehydratedMessages())),
                    userHistory: () => chatHistory.changes,
                    userProductSubscription: () =>
                        userProductSubscription.pipe(
                            map(value => (value === pendingOperation ? null : value))
                        ),
                }
            )
        )

        return viewOrPanel
    }

    private async setWebviewToChat(): Promise<void> {
        const viewOrPanel = this._webviewPanelOrView ?? (await this.createWebviewViewOrPanel())
        this._webviewPanelOrView = viewOrPanel
        revealWebviewViewOrPanel(viewOrPanel)
        await this.postMessage({
            type: 'view',
            view: View.Chat,
        })
    }

    // #endregion
    // =======================================================================
    // #region other public accessors and mutators
    // =======================================================================

    // Convenience function for tests
    public getViewTranscript(): readonly ChatMessage[] {
        return this.chatBuilder.getMessages().map(prepareChatMessage)
    }

    public isEmpty(): boolean {
        return this.chatBuilder.isEmpty()
    }

    public isVisible(): boolean {
        return this.webviewPanelOrView?.visible ?? false
    }
}

function newChatModelFromSerializedChatTranscript(
    json: SerializedChatTranscript,
    modelID: string | undefined,
    newSessionID?: string
): ChatBuilder {
    return new ChatBuilder(
        migrateAndNotifyForOutdatedModels(modelID ?? null) ?? undefined,
        newSessionID ?? json.id,
        json.interactions.flatMap((interaction: SerializedChatInteraction): ChatMessage[] =>
            [
                PromptString.unsafe_deserializeChatMessage(interaction.humanMessage),
                interaction.assistantMessage
                    ? PromptString.unsafe_deserializeChatMessage(interaction.assistantMessage)
                    : null,
            ].filter(isDefined)
        ),
        json.chatTitle
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

/**
 * Set HTML for webview (panel) & webview view (sidebar)
 */
async function addWebviewViewHTML(
    extensionClient: Pick<ExtensionClient, 'capabilities'>,
    extensionUri: vscode.Uri,
    view: vscode.WebviewView | vscode.WebviewPanel
): Promise<void> {
    if (extensionClient.capabilities?.webview === 'agentic') {
        return
    }
    const config = extensionClient.capabilities?.webviewNativeConfig
    const webviewPath = vscode.Uri.joinPath(extensionUri, 'dist', 'webviews')
    const root = vscode.Uri.joinPath(webviewPath, 'index.html')
    const bytes = await vscode.workspace.fs.readFile(root)
    const html = new TextDecoder('utf-8').decode(bytes)

    view.webview.html = manipulateWebviewHTML(html, {
        cspSource: view.webview.cspSource,
        resources: config?.skipResourceRelativization
            ? undefined
            : view.webview.asWebviewUri(webviewPath),
        injectScript: config?.injectScript ?? undefined,
        injectStyle: config?.injectStyle ?? undefined,
    })
}

interface TransformHTMLOptions {
    cspSource: string
    resources?: vscode.Uri
    injectScript?: string
    injectStyle?: string
}

// Exported for testing purposes
export function manipulateWebviewHTML(html: string, options: TransformHTMLOptions): string {
    if (options.resources) {
        html = html.replaceAll('./', `${options.resources}/`)
    }

    // If a script or style is injected, replace the placeholder with the script or style
    // and drop the content-security-policy meta tag which prevents inline scripts and styles
    if (options.injectScript || options.injectStyle) {
        html = html
            .replace(/<!-- START CSP -->.*<!-- END CSP -->/s, '')
            .replaceAll('/*injectedScript*/', options.injectScript ?? '')
            .replaceAll('/*injectedStyle*/', options.injectStyle ?? '')
    } else {
        // Update URIs for content security policy to only allow specific scripts to be run
        html = html.replaceAll("'self'", options.cspSource).replaceAll('{cspSource}', options.cspSource)
    }

    return html
}

// This is the manual ordering of the different retrieved and explicit context sources
// It should be equivalent to the ordering of things in
// ChatController:legacyComputeContext > context.ts:resolveContext
function combineContext(
    explicitMentions: ContextItem[],
    openCtxContext: ContextItemOpenCtx[],
    priorityContext: ContextItem[],
    retrievedContext: ContextItem[]
): ContextItem[] {
    return [explicitMentions, openCtxContext, priorityContext, retrievedContext].flat()
}

async function joinModelWaitlist(): Promise<void> {
    await localStorage.setOrDeleteWaitlistO1(true)
    telemetryRecorder.recordEvent('cody.joinLlmWaitlist', 'clicked')
}

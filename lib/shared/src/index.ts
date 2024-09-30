import {
    enablePatches as enableImmerJSONPatchSupport,
    enableMapSet as enableImmerMapSetSupport,
} from 'immer'

if (false as unknown) {
    /**
     * TODO: @sqs Enabeling JSON patches might be a nice way of economically
     * syncing state to from the extension to the WebView.
     *
     * This would be helpful (but not required) to potentially move all current
     * state and observables into simple `https://mobx-keystone.js.org/` classes
     * in the webview. By then using the mobx-react binding it makes the UI a
     * lot more friendly to work with and we remove this massive waterfall of
     * forwarded props as each component can directly access the state it needs
     * and re-render on changes. I've done this before in Tauri apps and it
     * works beautifully!
     */

    enableImmerJSONPatchSupport()
}
enableImmerMapSetSupport()

// Add anything else here that needs to be used outside of this library.

export * from './auth/authStatus'
export * from './auth/referral'
export * from './auth/tokens'
export * from './auth/types'
export { BotResponseMultiplexer } from './chat/bot-response-multiplexer'
export { ChatClient } from './chat/chat'
export { getSimplePreamble } from './chat/preamble'
export * from './chat/sse-iterator'
export { serializeChatMessage } from './chat/transcript'
export type {
    SerializedChatInteraction,
    SerializedChatTranscript,
} from './chat/transcript'
export {
    CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID,
    webviewOpenURIForContextItem,
} from './chat/transcript/display-text'
export {
    DEFAULT_EVENT_SOURCE,
    errorToChatError,
} from './chat/transcript/messages'
export type {
    AccountKeyedChatHistory,
    ChatError,
    ChatHistory,
    ChatHistoryKey,
    ChatMessage,
    EventSource,
    RankedContext,
    SerializedChatMessage,
    UserLocalHistory,
} from './chat/transcript/messages'
export { Typewriter } from './chat/typewriter'
export { reformatBotMessageForChat } from './chat/viewHelpers'
export type {
    ContextGroup,
    ContextProvider,
    Disposable,
    LocalSearchProvider,
    RemoteSearchProvider,
    SearchProvider,
} from './codebase-context/context-status'
export {
    ContextItemSource,
    FILE_RANGE_TOOLTIP_LABEL,
    GENERAL_HELP_LABEL,
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
    type ContextFileType,
    type ContextItem,
    type ContextItemFile,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    type ContextItemSymbol,
    type ContextItemTree,
    type ContextItemWithContent,
    type ContextMessage,
    type SymbolKind,
} from './codebase-context/messages'
export * from './cody-ignore/context-filters-provider'
export {
    CustomCommandType,
    DefaultChatCommands,
    DefaultEditCommands,
    type DefaultCodyCommands,
} from './commands/types'
export type {
    CodyCommand,
    CodyCommandContext,
    CodyCommandMode,
    CodyCommandType,
    TerminalOutputArguments,
} from './commands/types'
export { dedupeWith, isDefined, isErrorLike, pluralize } from './common'
export * from './common/abortController'
export {
    extensionForLanguage,
    languageFromFilename,
    markdownCodeBlockLanguageIDForFilename,
    ProgrammingLanguage,
} from './common/languages'
export {
    defaultPathFunctions,
    pathFunctionsForURI,
    posixFilePaths,
} from './common/path'
export { isMacOS, isWindows } from './common/platform'
export {
    displayLineRange,
    displayRange,
    expandToLineRange,
    toRangeData,
    type RangeData,
} from './common/range'
export {
    assertFileURI,
    isFileURI,
    SUPPORTED_URI_SCHEMAS,
    uriBasename,
    uriDirname,
    uriExtname,
    uriParseNameAndExtension,
    type FileURI,
} from './common/uri'
export * from './completions/types'
export * from './configuration'
export * from './configuration/resolver'
export {
    GIT_OPENCTX_PROVIDER_URI,
    openCtx,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    setOpenCtx,
    WEB_PROVIDER_URI,
} from './context/openctx/api'
export * from './context/openctx/context'
export { NoopEditor } from './editor'
export type {
    ActiveTextEditor,
    ActiveTextEditorDiagnostic,
    ActiveTextEditorDiagnosticType,
    ActiveTextEditorSelection,
    ActiveTextEditorVisibleContent,
    Editor,
} from './editor'
export {
    displayPath,
    displayPathBasename,
    displayPathDirname,
    displayPathWithoutWorkspaceFolderPrefix,
    setDisplayPathEnvInfo,
    uriHasPrefix,
    type DisplayPathEnvInfo,
} from './editor/displayPath'
export * from './editor/editorState'
export { hydrateAfterPostMessage } from './editor/hydrateAfterPostMessage'
export * from './editor/utils'
export {
    FeatureFlag,
    featureFlagProvider,
    type FeatureFlagProvider,
} from './experimentation/FeatureFlagProvider'
export * from './fetch'
export { GuardrailsPost } from './guardrails'
export type { Attribution, Guardrails } from './guardrails'
export { SourcegraphGuardrailsClient } from './guardrails/client'
export type { GuardrailsClientConfig } from './guardrails/client'
export {
    CompletionStopReason,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
    type CompletionResponseWithMetaData,
    type SerializedCodeCompletionsParams,
} from './inferenceClient/misc'
export * from './lexicalEditor/editorState'
export {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE,
    UNKNOWN_NODES_EDITOR_STATE_FIXTURE,
} from './lexicalEditor/fixtures'
export * from './lexicalEditor/nodes'
export * from './llm-providers/google/chat-client'
export * from './llm-providers/groq/chat-client'
export {
    createOllamaClient,
    OLLAMA_DEFAULT_URL,
    ollamaChatClient,
    type OllamaGenerateParams,
} from './llm-providers/ollama'
export { fetchLocalOllamaModels } from './llm-providers/ollama/utils'
export { getCompletionsModelConfig } from './llm-providers/utils'
export type { Result } from './local-context'
export { logDebug, logError, setLogger } from './logger'
export {
    FILE_CONTEXT_MENTION_PROVIDER,
    mentionProvidersMetadata,
    openCtxProviderMetadata,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type ContextItemProps,
    type ContextMentionProviderID,
    type ContextMentionProviderMetadata,
} from './mentions/api'
export {
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
    type MentionQuery,
} from './mentions/query'
export * from './misc/observable'
export * from './misc/mutable'
export * from './misc/observableOperation'
export {
    addMessageListenersForExtensionAPI,
    createMessageAPIForExtension,
    createMessageAPIForWebview,
    proxyExtensionAPI,
    type GenericVSCodeWrapper,
    type GenericWebviewAPIWrapper,
    type RequestMessage,
    type ResponseMessage,
} from './misc/rpc/rpc'
export * from './misc/rpc/webviewAPI'
export { getMockedDotComClientModels, getMockedDotComServerModels } from './models/dotcom'
export {
    createModel,
    createModelFromServerModel,
    modelTier,
    parseModelRef,
    toLegacyModel,
    type Model,
    type ServerModel,
} from './models/model'
export {
    mockModelsService,
    modelsService,
    ModelsService,
    TestLocalStorageForModelPreferences,
    type LegacyModelRefStr,
    type LocalStorageForModelPreferences,
    type ModelCategory,
    type ModelRef,
    type ModelRefStr,
    type ModelsData,
    type ModelTier,
    type PerSitePreferences,
    type ServerModelConfiguration,
    type SitePreferences,
} from './models/modelsService'
export { ModelTag } from './models/tags'
export {
    ModelUsage,
    type ChatModel,
    type ChatProvider,
    type EditModel,
    type EditProvider,
    type ModelContextWindow,
} from './models/types'
export {
    getModelInfo,
    getProviderName,
    isCodyProModel,
    isCustomModel,
    isWaitlistModel,
    toModelRefStr,
} from './models/utils'
export {
    ANSWER_TOKENS,
    MAX_BYTES_PER_FILE,
    MAX_CURRENT_FILE_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    SURROUNDING_LINES,
} from './prompt/constants'
export { newPromptMixin, PromptMixin } from './prompt/prompt-mixin'
export * from './prompt/prompt-string'
export * from './prompt/templates'
export {
    truncatePromptString,
    truncatePromptStringStart,
    truncateTextNearestLine,
} from './prompt/truncation'
export * from './singletons'
export type { Message } from './sourcegraph-api'
export {
    addClientInfoParams,
    getClientInfoParams,
    setClientNameVersion,
} from './sourcegraph-api/client-name-version'
export { ClientConfigSingleton, type CodyClientConfig } from './sourcegraph-api/clientConfig'
export { SourcegraphBrowserCompletionsClient } from './sourcegraph-api/completions/browserClient'
export { SourcegraphCompletionsClient } from './sourcegraph-api/completions/client'
export type {
    CompletionLogger,
    CompletionRequestParameters,
} from './sourcegraph-api/completions/client'
export * from './sourcegraph-api/completions/parse'
export { parseEvents } from './sourcegraph-api/completions/parse'
export * from './sourcegraph-api/completions/types'
export { getSerializedParams } from './sourcegraph-api/completions/utils'
export {
    DOTCOM_URL,
    isDotCom,
} from './sourcegraph-api/environments'
export {
    AbortError,
    isAbortError,
    isAbortErrorOrSocketHangUp,
    isAuthError,
    isContextWindowLimitError,
    isNetworkError,
    isNetworkLikeError,
    isRateLimitError,
    NetworkError,
    RateLimitError,
    TimeoutError,
    TracedError,
} from './sourcegraph-api/errors'
export {
    graphqlClient,
    SourcegraphGraphQLAPIClient,
} from './sourcegraph-api/graphql'
export {
    addCustomUserAgent,
    customUserAgent,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    INCLUDE_EVERYTHING_CONTEXT_FILTERS,
    isNodeResponse,
    setUserAgent,
    type BrowserOrNodeResponse,
    type LogEventMode,
    type ContextFilters,
    type CodyContextFilterItem,
    type RepoListResponse,
    type SuggestionsRepo,
    type RepoSuggestionsSearchResponse,
    type ChatIntentResult,
    type CodyContextFilterItem,
    type ContextFilters,
    type InputContextItem,
    type LogEventMode,
    type RepoListResponse,
    type RepoSuggestionsSearchResponse,
    type SuggestionsRepo,
} from './sourcegraph-api/graphql/client'
export type {
    CodyLLMSiteConfiguration,
    ContextSearchResult,
    CurrentUserCodySubscription,
    event,
    Prompt,
} from './sourcegraph-api/graphql/client'
export { RestClient } from './sourcegraph-api/rest/client'
export { GraphQLTelemetryExporter } from './sourcegraph-api/telemetry/GraphQLTelemetryExporter'
export * from './sourcegraph-api/utils'
export { type BillingCategory, type BillingProduct } from './telemetry-v2'
export * from './telemetry-v2/singleton'
export {
    MockServerTelemetryRecorderProvider,
    noOpTelemetryRecorder,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorderProvider,
    type ExtensionDetails,
} from './telemetry-v2/TelemetryRecorderProvider'
export type { TelemetryRecorder } from './telemetry-v2/TelemetryRecorderProvider'
export { testFileUri } from './test/path-helpers'
export * from './token'
export * from './token/constants'
export { CORPUS_CONTEXT_ALLOCATION as ENHANCED_CONTEXT_ALLOCATION } from './token/constants'
export { getTokenCounterUtils, TokenCounter, TokenCounterUtils } from './token/counter'
export { charsToTokens, tokensToChars } from './token/utils'
export * from './tracing'
export {
    assertUnreachable,
    convertGitCloneURLToCodebaseName,
    createSubscriber,
    isError,
    nextTick,
    promise,
    type ReadonlyDeep,
} from './utils'
export type { CurrentUserCodySubscription } from './sourcegraph-api/graphql/client'
export * from './auth/types'
export * from './auth/tokens'
export * from './auth/referral'
export * from './chat/sse-iterator'
export {
    parseMentionQuery,
    type MentionQuery,
    scanForMentionTriggerInUserTextInput,
} from './mentions/query'
export {
    type ContextItemProps,
    mentionProvidersMetadata,
    openCtxProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type ContextMentionProviderID,
    type ContextMentionProviderMetadata,
} from './mentions/api'
export { TokenCounter, getTokenCounterUtils, TokenCounterUtils } from './token/counter'
export { CORPUS_CONTEXT_ALLOCATION as ENHANCED_CONTEXT_ALLOCATION } from './token/constants'
export { tokensToChars, charsToTokens } from './token/utils'
export * from './prompt/prompt-string'
export { getCompletionsModelConfig } from './llm-providers/utils'
export * from './llm-providers/google/chat-client'
export * from './llm-providers/groq/chat-client'
export * from './fetch'
export * from './completions/types'
export * from './sourcegraph-api/completions/parse'
export * from './cody-ignore/context-filters-provider'
export * from './sourcegraph-api/utils'
export * from './token'
export * from './token/constants'
export * from './configuration'
export {
    setOpenCtx,
    openCtx,
    REMOTE_REPOSITORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_DIRECTORY_PROVIDER_URI,
    WEB_PROVIDER_URI,
    GIT_OPENCTX_PROVIDER_URI,
} from './context/openctx/api'
export * from './context/openctx/context'
export * from './lexicalEditor/editorState'
export * from './lexicalEditor/nodes'
export {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE,
    UNKNOWN_NODES_EDITOR_STATE_FIXTURE,
} from './lexicalEditor/fixtures'
export { getSerializedParams } from './sourcegraph-api/completions/utils'
export * from './misc/rpc/webviewAPI'
export {
    proxyExtensionAPI,
    addMessageListenersForExtensionAPI,
    createMessageAPIForWebview,
    type ResponseMessage,
    type RequestMessage,
    type GenericVSCodeWrapper,
    type GenericWebviewAPIWrapper,
    createMessageAPIForExtension,
} from './misc/rpc/rpc'
export * from './misc/observable'
export * from './misc/observableOperation'
export * from './misc/observableDataStructures'
export * from './configuration/resolver'
export * from './configuration/clientCapabilities'
export * from './singletons'
export * from './auth/authStatus'
export { fetchLocalOllamaModels } from './llm-providers/ollama/utils'
export * from './editor/editorState'

// Add anything else here that needs to be used outside of this library.

export {
    Model,
    modelsService,
    mockModelsService,
    type ServerModel,
    type ServerModelConfiguration,
} from './models'
export {
    type EditModel,
    type EditProvider,
    type ChatModel,
    type ChatProvider,
    ModelUsage,
    type ModelContextWindow,
} from './models/types'
export { getDotComDefaultModels } from './models/dotcom'
export { ModelTag } from './models/tags'
export {
    getProviderName,
    getModelInfo,
    isCodyProModel,
    isCustomModel,
    toModelRefStr,
} from './models/utils'
export { BotResponseMultiplexer } from './chat/bot-response-multiplexer'
export { ChatClient } from './chat/chat'
export { getSimplePreamble } from './chat/preamble'
export type {
    SerializedChatInteraction,
    SerializedChatTranscript,
} from './chat/transcript'
export { serializeChatMessage } from './chat/transcript'
export {
    errorToChatError,
    DEFAULT_EVENT_SOURCE,
} from './chat/transcript/messages'
export type {
    AccountKeyedChatHistory,
    ChatHistoryKey,
    ChatError,
    EventSource,
    ChatHistory,
    ChatMessage,
    UserLocalHistory,
    SerializedChatMessage,
    RankedContext,
} from './chat/transcript/messages'
export {
    CODY_PASSTHROUGH_VSCODE_OPEN_COMMAND_ID,
    webviewOpenURIForContextItem,
} from './chat/transcript/display-text'
export { Typewriter } from './chat/typewriter'
export { reformatBotMessageForChat } from './chat/viewHelpers'
export type {
    ContextGroup,
    ContextProvider,
    Disposable,
    EnhancedContextContextT,
    LocalEmbeddingsProvider,
    LocalSearchProvider,
    RemoteSearchProvider,
    SearchProvider,
} from './codebase-context/context-status'
export {
    type ContextItem,
    type ContextItemFile,
    type ContextItemOpenCtx,
    ContextItemSource,
    type ContextItemWithContent,
    type ContextItemSymbol,
    type ContextFileType,
    type ContextMessage,
    type SymbolKind,
    type ContextItemTree,
    type ContextItemRepository,
    FILE_RANGE_TOOLTIP_LABEL,
    GENERAL_HELP_LABEL,
    IGNORED_FILE_WARNING_LABEL,
    LARGE_FILE_WARNING_LABEL,
    NO_SYMBOL_MATCHES_HELP_LABEL,
} from './codebase-context/messages'
export type {
    CodyCommand,
    CodyCommandContext,
    CodyCommandType,
    CodyCommandMode,
    TerminalOutputArguments,
} from './commands/types'
export { CustomCommandType } from './commands/types'
export {
    type DefaultCodyCommands,
    DefaultChatCommands,
    DefaultEditCommands,
} from './commands/types'
export { dedupeWith, isDefined, isErrorLike, pluralize } from './common'
export {
    type RangeData,
    toRangeData,
    displayLineRange,
    displayRange,
    expandToLineRange,
} from './common/range'
export * from './common/abortController'
export {
    ProgrammingLanguage,
    languageFromFilename,
    markdownCodeBlockLanguageIDForFilename,
    extensionForLanguage,
} from './common/languages'
export {
    posixFilePaths,
    pathFunctionsForURI,
    defaultPathFunctions,
} from './common/path'
export { parseEvents } from './sourcegraph-api/completions/parse'
export { isWindows, isMacOS } from './common/platform'
export {
    assertFileURI,
    isFileURI,
    uriBasename,
    uriDirname,
    uriExtname,
    uriParseNameAndExtension,
    SUPPORTED_URI_SCHEMAS,
    type FileURI,
} from './common/uri'
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
    uriHasPrefix,
    displayPathDirname,
    displayPathWithoutWorkspaceFolderPrefix,
    setDisplayPathEnvInfo,
    type DisplayPathEnvInfo,
} from './editor/displayPath'
export { hydrateAfterPostMessage } from './editor/hydrateAfterPostMessage'
export * from './editor/utils'
export {
    FeatureFlag,
    FeatureFlagProvider,
    featureFlagProvider,
} from './experimentation/FeatureFlagProvider'
export { GuardrailsPost } from './guardrails'
export type { Attribution, Guardrails } from './guardrails'
export { SourcegraphGuardrailsClient } from './guardrails/client'
export type { GuardrailsClientConfig } from './guardrails/client'
export {
    CompletionStopReason,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type SerializedCodeCompletionsParams,
    type CompletionResponseGenerator,
    type CompletionResponseWithMetaData,
} from './inferenceClient/misc'
export type {
    LocalEmbeddingsFetcher,
    Result,
} from './local-context'
export { logDebug, logError, setLogger } from './logger'
export {
    createOllamaClient,
    ollamaChatClient,
    type OllamaGenerateParams,
    OLLAMA_DEFAULT_URL,
} from './llm-providers/ollama'
export {
    MAX_BYTES_PER_FILE,
    MAX_CURRENT_FILE_TOKENS,
    ANSWER_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    SURROUNDING_LINES,
} from './prompt/constants'
export { PromptMixin, newPromptMixin } from './prompt/prompt-mixin'
export * from './prompt/templates'
export {
    truncateTextNearestLine,
    truncatePromptStringStart,
    truncatePromptString,
} from './prompt/truncation'
export type { Message } from './sourcegraph-api'
export {
    addClientInfoParams,
    getClientInfoParams,
    setClientNameVersion,
} from './sourcegraph-api/client-name-version'
export { SourcegraphBrowserCompletionsClient } from './sourcegraph-api/completions/browserClient'
export { SourcegraphCompletionsClient } from './sourcegraph-api/completions/client'
export type {
    CompletionLogger,
    CompletionsClientConfig,
    CompletionRequestParameters,
} from './sourcegraph-api/completions/client'
export * from './sourcegraph-api/completions/types'
export {
    DOTCOM_URL,
    isDotCom,
} from './sourcegraph-api/environments'
export {
    AbortError,
    NetworkError,
    RateLimitError,
    TimeoutError,
    TracedError,
    isAbortError,
    isAbortErrorOrSocketHangUp,
    isContextWindowLimitError,
    isAuthError,
    isNetworkError,
    isNetworkLikeError,
    isRateLimitError,
} from './sourcegraph-api/errors'
export {
    SourcegraphGraphQLAPIClient,
    graphqlClient,
} from './sourcegraph-api/graphql'
export {
    ClientConfigSingleton,
    addCustomUserAgent,
    customUserAgent,
    isNodeResponse,
    setUserAgent,
    INCLUDE_EVERYTHING_CONTEXT_FILTERS,
    EXCLUDE_EVERYTHING_CONTEXT_FILTERS,
    type BrowserOrNodeResponse,
    type GraphQLAPIClientConfig,
    type LogEventMode,
    type ContextFilters,
    type CodyContextFilterItem,
    type RepoListResponse,
    type SuggestionsRepo,
    type RepoSuggestionsSearchResponse,
    type InputContextItem,
    type ChatIntentResult,
} from './sourcegraph-api/graphql/client'
export type {
    CodyLLMSiteConfiguration,
    ContextSearchResult,
    EmbeddingsSearchResult,
    Prompt,
    event,
} from './sourcegraph-api/graphql/client'
export { RestClient } from './sourcegraph-api/rest/client'
export { GraphQLTelemetryExporter } from './sourcegraph-api/telemetry/GraphQLTelemetryExporter'
export { type BillingCategory, type BillingProduct } from './telemetry-v2'
export {
    MockServerTelemetryRecorderProvider,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorderProvider,
    noOpTelemetryRecorder,
    type ExtensionDetails,
} from './telemetry-v2/TelemetryRecorderProvider'
export type { TelemetryRecorder } from './telemetry-v2/TelemetryRecorderProvider'
export * from './telemetry-v2/singleton'
export { testFileUri } from './test/path-helpers'
export * from './tracing'
export {
    convertGitCloneURLToCodebaseName,
    createSubscriber,
    isError,
    nextTick,
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
export { type ClientStateForWebview } from './clientState'
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
export * from './configuration/resolver'
export * from './singletons'
export * from './auth/authStatus'

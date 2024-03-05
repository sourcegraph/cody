// Add anything else here that needs to be used outside of this library.

export { ModelProvider } from './models'
export type { ChatModel, EditModel } from './models/types'
export { BotResponseMultiplexer } from './chat/bot-response-multiplexer'
export { ChatClient } from './chat/chat'
export type { ChatContextStatus } from './chat/context'
export { ignores, isCodyIgnoredFile } from './cody-ignore/context-filter'
export { CODY_IGNORE_POSIX_GLOB, type IgnoreFileContent } from './cody-ignore/ignore-helper'
export { renderCodyMarkdown } from './chat/markdown'
export { getSimplePreamble } from './chat/preamble'
export type { TranscriptJSON } from './chat/transcript'
export type { InteractionJSON } from './chat/transcript/interaction'
export { errorToChatError } from './chat/transcript/messages'
export {
    getAtMentionQuery,
    getAtMentionedInputText,
    getContextFileDisplayText,
    verifyContextFilesFromInput,
    isAtMention,
    isAtRange,
} from './chat/input'
export type {
    ChatError,
    ChatEventSource,
    ChatHistory,
    ChatInputHistory,
    ChatMessage,
    UserLocalHistory,
} from './chat/transcript/messages'
export { Typewriter } from './chat/typewriter'
export { reformatBotMessageForChat } from './chat/viewHelpers'
export { CodebaseContext } from './codebase-context'
export type {
    ContextGroup,
    ContextProvider,
    ContextStatusProvider,
    Disposable,
    EnhancedContextContextT,
    LocalEmbeddingsProvider,
    LocalSearchProvider,
    RemoteSearchProvider,
    SearchProvider,
} from './codebase-context/context-status'
export { createContextMessageByFile, getContextMessageWithResponse } from './codebase-context/messages'
export type {
    ContextItem,
    ContextItemFile,
    ContextFileSource,
    ContextItemSymbol,
    ContextFileType,
    ContextMessage,
    SymbolKind,
} from './codebase-context/messages'
export type { CodyCommand, CodyCommandContext, CodyCommandType } from './commands/types'
export { type DefaultCodyCommands, DefaultChatCommands } from './commands/types'
export { dedupeWith, isDefined, isErrorLike, pluralize } from './common'
export { type RangeData, toRangeData } from './common/range'
export {
    ProgrammingLanguage,
    languageFromFilename,
    markdownCodeBlockLanguageIDForFilename,
} from './common/languages'
export { renderMarkdown } from './common/markdown'
export { posixFilePaths } from './common/path'
export { isWindows, isMacOS } from './common/platform'
export {
    assertFileURI,
    isFileURI,
    uriBasename,
    uriDirname,
    uriExtname,
    uriParseNameAndExtension,
    type FileURI,
} from './common/uri'
export type {
    AutocompleteTimeouts,
    Configuration,
    ConfigurationUseContext,
    ConfigurationWithAccessToken,
    OllamaGenerateParameters,
    OllamaOptions,
} from './configuration'
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
    type DisplayPathEnvInfo,
} from './editor/displayPath'
export { hydrateAfterPostMessage } from './editor/hydrateAfterPostMessage'
export {
    FeatureFlag,
    FeatureFlagProvider,
    featureFlagProvider,
} from './experimentation/FeatureFlagProvider'
export { GuardrailsPost, summariseAttribution } from './guardrails'
export type { Attribution, Guardrails } from './guardrails'
export { SourcegraphGuardrailsClient } from './guardrails/client'
export {
    CompletionStopReason,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
} from './inferenceClient/misc'
export type { IntentClassificationOption, IntentDetector } from './intent-detector'
export { SourcegraphIntentDetectorClient } from './intent-detector/client'
export type {
    ContextResult,
    FilenameContextFetcher,
    IndexedKeywordContextFetcher,
    LocalEmbeddingsFetcher,
    IRemoteSearch,
    Result,
    SearchPanelFile,
    SearchPanelSnippet,
} from './local-context'
export { logDebug, logError, setLogger } from './logger'
export { createOllamaClient, type OllamaGenerateParams } from './ollama/ollama-client'
export {
    MAX_BYTES_PER_FILE,
    MAX_CURRENT_FILE_TOKENS,
    MAX_HUMAN_INPUT_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    SURROUNDING_LINES,
    tokensToChars,
} from './prompt/constants'
export { PromptMixin, newPromptMixin } from './prompt/prompt-mixin'
export * from './prompt/templates'
export {
    truncateText,
    truncateTextNearestLine,
    truncateTextStart,
} from './prompt/truncation'
export type { Message } from './sourcegraph-api'
export { SourcegraphBrowserCompletionsClient } from './sourcegraph-api/completions/browserClient'
export { SourcegraphCompletionsClient } from './sourcegraph-api/completions/client'
export type { CompletionLogger, CompletionsClientConfig } from './sourcegraph-api/completions/client'
export type {
    CompletionParameters,
    CompletionResponse,
    Event,
} from './sourcegraph-api/completions/types'
export { DOTCOM_URL, LOCAL_APP_URL, isDotCom } from './sourcegraph-api/environments'
export {
    AbortError,
    NetworkError,
    RateLimitError,
    TimeoutError,
    TracedError,
    isAbortError,
    isAuthError,
    isNetworkError,
    isRateLimitError,
} from './sourcegraph-api/errors'
export { SourcegraphGraphQLAPIClient, graphqlClient } from './sourcegraph-api/graphql'
export {
    ConfigFeaturesSingleton,
    addCustomUserAgent,
    customUserAgent,
    isNodeResponse,
    setUserAgent,
    type BrowserOrNodeResponse,
    type GraphQLAPIClientConfig,
    type LogEventMode,
} from './sourcegraph-api/graphql/client'
export type {
    CodyLLMSiteConfiguration,
    ContextSearchResult,
    EmbeddingsSearchResult,
    event,
} from './sourcegraph-api/graphql/client'
export { GraphQLTelemetryExporter } from './sourcegraph-api/telemetry/GraphQLTelemetryExporter'
export { NOOP_TELEMETRY_SERVICE } from './telemetry'
export type { TelemetryEventProperties, TelemetryService } from './telemetry'
export { type BillingCategory, type BillingProduct } from './telemetry-v2'
export {
    MockServerTelemetryRecorderProvider,
    NoOpTelemetryRecorderProvider,
    TelemetryRecorderProvider,
} from './telemetry-v2/TelemetryRecorderProvider'
export type { TelemetryRecorder } from './telemetry-v2/TelemetryRecorderProvider'
export { EventLogger } from './telemetry/EventLogger'
export type { ExtensionDetails } from './telemetry/EventLogger'
export { testFileUri } from './test/path-helpers'
export { addTraceparent, getActiveTraceAndSpanId, wrapInActiveSpan } from './tracing'
export { convertGitCloneURLToCodebaseName, isError } from './utils'
export type { CurrentUserCodySubscription } from './sourcegraph-api/graphql/client'

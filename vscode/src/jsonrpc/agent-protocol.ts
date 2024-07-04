import type {
    AuthStatus,
    BillingCategory,
    BillingProduct,
    CodyCommand,
    ContextFilters,
    CurrentUserCodySubscription,
    Model,
    ModelUsage,
    SerializedChatMessage,
    SerializedChatTranscript,
    event,
} from '@sourcegraph/cody-shared'
import type {
    KnownKeys,
    KnownString,
    TelemetryEventMarketingTrackingInput,
    TelemetryEventParameters,
} from '@sourcegraph/telemetry'
import type * as vscode from 'vscode'

import type { ExtensionMessage, WebviewMessage } from '../chat/protocol'
import type { CompletionBookkeepingEvent } from '../completions/logger'
import type { Repo } from '../context/repo-fetcher'
import type { FixupTaskID } from '../non-stop/FixupTask'
import type { CodyTaskState } from '../non-stop/utils'

// This file documents the Cody Agent JSON-RPC protocol. Consult the JSON-RPC
// specification to learn about how JSON-RPC works https://www.jsonrpc.org/specification
// The Cody Agent server only supports transport via stdout/stdin.

// The JSON-RPC requests of the Cody Agent protocol. Requests are async
// functions that return some (possibly null) value.
export type Requests = ClientRequests & ServerRequests

// ================
// Client -> Server
// ================
export type ClientRequests = {
    // The 'initialize' request must be sent at the start of the connection
    // before any other request/notification is sent.
    initialize: [ClientInfo, ServerInfo]
    // The 'shutdown' request must be sent before terminating the agent process.
    shutdown: [null, null]

    // Start a new chat session and returns a UUID that can be used to reference
    // this session in other requests like chat/submitMessage or
    // webview/didDispose.
    'chat/new': [null, string]

    // Start a new chat session and returns panel id and chat id that later can
    // be used to reference to the session with panel id and restore chat with
    // chat id. Main difference compared to the chat/new is that we return chatId.
    'chat/web/new': [null, { panelId: string; chatId: string }]

    // Deletes chat by its ID and returns newly updated chat history list
    // Primary is used only in cody web client
    'chat/delete': [{ chatId: string }, ChatExportResult[]]

    // Similar to `chat/new` except it starts a new chat session from an
    // existing transcript. The chatID matches the `chatID` property of the
    // `type: 'transcript'` ExtensionMessage that is sent via
    // `webview/postMessage`. Returns a new *panel* ID, which can be used to
    // send a chat message via `chat/submitMessage`.
    'chat/restore': [
        {
            modelID?: string | undefined | null
            messages: SerializedChatMessage[]
            chatID: string
        },
        string,
    ]

    'chat/models': [{ modelUsage: ModelUsage }, { models: Model[] }]
    'chat/export': [null | { fullHistory: boolean }, ChatExportResult[]]
    'chat/remoteRepos': [{ id: string }, { remoteRepos?: Repo[] | undefined | null }]

    // High-level wrapper around webview/receiveMessage and webview/postMessage
    // to submit a chat message. The ID is the return value of chat/id, and the
    // message is forwarded verbatim via webview/receiveMessage. This helper
    // abstracts over the low-level webview notifications so that you can await
    // on the request.  Subscribe to webview/postMessage to stream the reply
    // while awaiting on this response.
    'chat/submitMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]
    'chat/editMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]

    // Trigger chat-based commands (explain, test, smell), which are effectively
    // shortcuts to start a new chat with a templated question. The return value
    // of these commands is the same as `chat/new`, an ID to reference to the
    // webview panel where the reply from this command appears.
    'commands/explain': [null, string] // TODO: rename to chatCommands/{explain,test,smell}
    'commands/test': [null, string]
    'commands/smell': [null, string]

    // Trigger custom commands that could be a chat-based command or an edit command.
    'commands/custom': [{ key: string }, CustomCommandResult]

    // A list of available custom commands stored in .cody/commands.json.
    'customCommands/list': [null, CodyCommand[]]

    // Trigger commands that edit the code.
    'editCommands/code': [
        {
            instruction: string
            model?: string | undefined | null
            mode?: 'edit' | 'insert' | undefined | null
            range?: Range | undefined | null
        },
        EditTask,
    ]
    'editCommands/test': [null, EditTask]
    'editCommands/document': [null, EditTask]

    // If the task is "applied", discards the task.
    'editTask/accept': [{ id: FixupTaskID }, null]
    // If the task is "applied", attempts to revert the task's edit, then
    // discards the task.
    'editTask/undo': [{ id: FixupTaskID }, null]
    // Discards the task. Applicable to tasks in any state.
    'editTask/cancel': [{ id: FixupTaskID }, null]
    'editTask/retry': [
        {
            id: FixupTaskID
            instruction: string
            model: string
            mode: 'edit' | 'insert'
            range: Range
        },
        EditTask,
    ]
    'editTask/getTaskDetails': [{ id: FixupTaskID }, EditTask]

    // Utility for clients that don't have language-neutral folding-range support.
    // Provides a list of all the computed folding ranges in the specified document.
    'editTask/getFoldingRanges': [GetFoldingRangeParams, GetFoldingRangeResult]

    // Low-level API to trigger a VS Code command with any argument list. Avoid
    // using this API in favor of high-level wrappers like 'chat/new'.
    'command/execute': [ExecuteCommandParams, any]

    // Code actions are shortcuts to commands that can be triggered at a given
    // location.  You may be most familiar with code actions as the menu that
    // appears when you click on the lightbulb icon over diagnostics (red
    // squiggles). The flow to use code actions is:
    // 1. Request codeActions/provide to determine what actions are available
    //    at the given location
    // 2. Request codeActions/trigger for the selected code action.
    'codeActions/provide': [
        { location: ProtocolLocation; triggerKind: CodeActionTriggerKind },
        { codeActions: ProtocolCodeAction[] },
    ]
    // The ID parameter should match ProtocolCodeAction.id from
    // codeActions/provide.
    'codeActions/trigger': [{ id: string }, EditTask]

    'autocomplete/execute': [AutocompleteParams, AutocompleteResult]

    'graphql/getRepoIds': [{ names: string[]; first: number }, { repos: { name: string; id: string }[] }]

    'graphql/currentUserId': [null, string]

    'graphql/currentUserIsPro': [null, boolean]

    'featureFlags/getFeatureFlag': [{ flagName: string }, boolean | null]

    'graphql/getCurrentUserCodySubscription': [null, CurrentUserCodySubscription | null]
    /**
     * @deprecated use 'telemetry/recordEvent' instead.
     */
    'graphql/logEvent': [event, null]
    /**
     * Record telemetry events.
     */
    'telemetry/recordEvent': [TelemetryEvent, null]

    'graphql/getRepoIdIfEmbeddingExists': [{ repoName: string }, string | null]
    'graphql/getRepoId': [{ repoName: string }, string | null]

    'git/codebaseName': [{ url: string }, string | null]

    // High-level API to allow the agent to clean up resources related to a
    // webview ID (from chat/new).
    'webview/didDispose': [{ id: string }, null]

    // Low-level API to send a raw WebviewMessage from a specific webview (chat
    // session).  Refrain from using this API in favor of high-level APIs like
    // `chat/submitMessage`.
    'webview/receiveMessage': [{ id: string; message: WebviewMessage }, null]
    // Same as `webview/receiveMessage` except the parameter is a JSON-encoded
    // string.  The server processes this message by parsing
    // `messageStringEncoded` as JSON and then calling `webview/receiveMessage`.
    'webview/receiveMessageStringEncoded': [{ id: string; messageStringEncoded: string }, null]

    // Register diagnostics (aka. error/warning messages). Overwrites existing
    // diagnostics for the provided document URIs. This request should be used
    // alongside the `codeActions/provide` request.
    'diagnostics/publish': [{ diagnostics: ProtocolDiagnostic[] }, null]

    // Only used for testing purposes. If you want to write an integration test
    // for dealing with progress bars then you can send a request to this
    // endpoint to emulate the scenario where the server creates a progress bar.
    'testing/progress': [{ title: string }, { result: string }]
    'testing/networkRequests': [null, { requests: NetworkRequest[] }]
    'testing/requestErrors': [null, { errors: NetworkRequest[] }]
    'testing/closestPostData': [{ url: string; postData: string }, { closestBody: string }]
    'testing/memoryUsage': [null, { usage: MemoryUsage }]
    'testing/awaitPendingPromises': [null, null]
    // Retrieve the Agent's copy of workspace documents, for testing/validation.
    'testing/workspaceDocuments': [GetDocumentsParams, GetDocumentsResult]
    // Returns diagnostics for the given URI. Lives under `testing/` instead of
    // standalone `diagnostics/` because it only works for TypeScript files.
    'testing/diagnostics': [{ uri: string }, { diagnostics: ProtocolDiagnostic[] }]

    // Only used for testing purposes. This operation runs indefinitely unless
    // the client sends progress/cancel.
    'testing/progressCancelation': [{ title: string }, { result: string }]

    // Only used for testing purposes. Does a best-effort to reset the state
    // if the agent server. For example, closes all open documents.
    'testing/reset': [null, null]

    'testing/autocomplete/completionEvent': [
        CompletionItemParams,
        CompletionBookkeepingEvent | undefined | null,
    ]

    // Updates the extension configuration and returns the new
    // authentication status, which indicates whether the provided credentials are
    // valid or not. The agent can't support autocomplete or chat if the credentials
    // are invalid.
    'extensionConfiguration/change': [ExtensionConfiguration, AuthStatus | null]

    // Returns the current authentication status without making changes to it.
    'extensionConfiguration/status': [null, AuthStatus | null]

    // Returns the json schema of the extension confi
    'extensionConfiguration/getSettingsSchema': [null, string]

    'textDocument/change': [ProtocolTextDocument, { success: boolean }]

    // Run attribution search for a code snippet displayed in chat.
    // Attribution is an enterprise feature which allows to look for code generated
    // by Cody in an open source code corpus. User is notified if any such attribution
    // is found.
    // For more details, please see:
    // *   PRD: https://docs.google.com/document/d/1c3CLC7ICDaG63NOWjO6zWm-UElwuXkFrKbCKTw-7H6Q/edit
    // *   RFC: https://docs.google.com/document/d/1zSxFDQPxZcn5b6yKx40etpJayoibVzj_Gnugzln1weI/edit
    'attribution/search': [
        { id: string; snippet: string },
        {
            error?: string | undefined | null
            repoNames: string[]
            limitHit: boolean
        },
    ]

    // Gets whether the specified URI is sensitive and should not be sent to
    // LLM providers.
    'ignore/test': [
        { uri: string },
        {
            policy: 'ignore' | 'use'
        },
    ]

    // For testing. Overrides any ignore policy to ignore repositories and URIs
    // which match the specified regular expressions. Pass `undefined` to remove
    // the override.
    'testing/ignore/overridePolicy': [ContextFilters | null, null]

    // Gets whether the specific repo name is known on the remote.
    'remoteRepo/has': [{ repoName: string }, { result: boolean }]

    // Gets paginated list of repositories matching a fuzzy search query (or ''
    // for all repositories.) Remote repositories are fetched concurrently, so
    // subscribe to 'remoteRepo/didChange' to invalidate results.
    //
    // At the end of the list, returns an empty list of repositories.
    // If `afterId` is specified, but not in the query result set,
    // `startIndex` is -1.
    //
    // remoteRepo/list caches a single query result, making it efficient to page
    // through a large list of results provided the query is the same.
    'remoteRepo/list': [
        {
            // The user input to perform a fuzzy match with
            query?: string | undefined | null
            // The maximum number of results to retrieve
            first: number
            // The repository ID of the last result in the previous
            // page, or `undefined` to start from the beginning.
            afterId?: string | undefined | null
        },
        {
            // The index of the first result in the filtered repository list.
            startIndex: number
            // The total number of results in the filtered repository list.
            count: number
            // The repositories.
            repos: {
                name: string // eg github.com/sourcegraph/cody
                id: string // for use in afterId, Sourcegraph remotes
            }[]
            // The state of the underlying repo fetching.
            state: RemoteRepoFetchState
        },
    ]
}

// ================
// Server -> Client
// ================
export type ServerRequests = {
    'window/showMessage': [ShowWindowMessageParams, string | null]

    'textDocument/edit': [TextDocumentEditParams, boolean]
    'textDocument/openUntitledDocument': [UntitledTextDocument, ProtocolTextDocument | undefined | null]
    'textDocument/show': [
        {
            uri: string
            options?: TextDocumentShowOptionsParams | undefined | null
        },
        boolean,
    ]
    'workspace/edit': [WorkspaceEditParams, boolean]

    'webview/createWebviewPanel': [WebviewCreatePanelParams, WebviewCreatePanelResult]
    // TODO: Add VSCode support for registerWebviewViewProvider and views.
    // TODO: Add VSCode support for registerWebviewPanelSerializer.
    // TODO: Add additional notifications for Webview, etc. operations.
}

// The JSON-RPC notifications of the Cody Agent protocol. Notifications are
// synchronous fire-and-forget messages that have no return value. Notifications are
// conventionally used to represent streams of values.
export type Notifications = ClientNotifications & ServerNotifications

// ================
// Client -> Server
// ================
export type ClientNotifications = {
    // The 'initialized' notification must be sent after receiving the 'initialize' response.
    initialized: [null]
    // The 'exit' notification must be sent after the client receives the 'shutdown' response.
    exit: [null]

    // Deprecated: use the `extensionConfiguration/change` request instead so
    // that you can handle authentication errors in case the credentials are
    // invalid. The `extensionConfiguration/didChange` method does not support
    // error handling because it's a notification.
    // The server should use the provided connection configuration for all
    // subsequent requests/notifications. The previous extension configuration
    // should no longer be used.
    'extensionConfiguration/didChange': [ExtensionConfiguration]

    // The user has switched to a different workspace folder.
    'workspaceFolder/didChange': [{ uri: string }]

    // Lifecycle notifications for the client to notify the server about text
    // contents of documents and to notify which document is currently focused.
    'textDocument/didOpen': [ProtocolTextDocument]
    // The 'textDocument/didChange' notification should be sent on almost every
    // keystroke, whether the text contents changed or the cursor/selection
    // changed.  Leave the `content` property undefined when the document's
    // content is unchanged.
    'textDocument/didChange': [ProtocolTextDocument]
    // The user focused on a document without changing the document's content.
    'textDocument/didFocus': [{ uri: string }]
    // The user saved the file to disk.
    'textDocument/didSave': [{ uri: string }]
    // The user closed the editor tab for the given document.
    // Only the 'uri' property is required, other properties are ignored.
    'textDocument/didClose': [ProtocolTextDocument]

    'workspace/didDeleteFiles': [DeleteFilesParams]
    'workspace/didCreateFiles': [CreateFilesParams]
    'workspace/didRenameFiles': [RenameFilesParams]

    '$/cancelRequest': [CancelParams]
    // The user no longer wishes to consider the last autocomplete candidate
    // and the current autocomplete id should not be reused.
    'autocomplete/clearLastCandidate': [null]
    // The completion was presented to the user, and will be logged for telemetry
    // purposes.
    'autocomplete/completionSuggested': [CompletionItemParams]
    // The completion was accepted by the user, and will be logged for telemetry
    // purposes.
    'autocomplete/completionAccepted': [CompletionItemParams]

    // User requested to cancel this progress bar. Only supported for progress
    // bars with `cancelable: true`.
    'progress/cancel': [{ id: string }]
}

// ================
// Server -> Client
// ================
export type ServerNotifications = {
    'debug/message': [DebugMessage]

    // Certain properties of the task are updated:
    // - State
    // - The associated range has changed because the document was edited
    // Only sent if client capabilities fixupControls === 'events'
    'editTask/didUpdate': [EditTask]
    // The task is deleted because it has been accepted or cancelled.
    // Only sent if client capabilities fixupControls === 'events'.
    'editTask/didDelete': [EditTask]

    'codeLenses/display': [DisplayCodeLensParams]

    // The set of ignored files/repositories has changed. The client should
    // re-query using ignore/test.
    'ignore/didChange': [null]

    // Low-level webview notification for the given chat session ID (created via
    // chat/new). Subscribe to these messages to get access to streaming updates
    // on the chat reply.
    'webview/postMessage': [WebviewPostMessageParams]
    // Same as `webview/postMessage` but the `WebviewMessage` is string-encoded.
    // This method is only used when the `webviewMessages` client capability is
    // set to the value `'string'`.
    'webview/postMessageStringEncoded': [{ id: string; stringEncodedMessage: string }]

    'progress/start': [ProgressStartParams]

    // Update about an ongoing progress bar from progress/create. This
    // notification can only be sent from the server while the progress/create
    // request has not finished responding.
    'progress/report': [ProgressReportParams]

    'progress/end': [{ id: string }]

    // The list of remote repositories changed. Results from remoteRepo/list
    // may be stale and should be requeried.
    'remoteRepo/didChange': [null]
    // Reflects the state of fetching the repository list. After fetching is
    // complete, or errored, the results from remoteRepo/list will not change.
    // When configuration changes, repo fetching may re-start.
    'remoteRepo/didChangeState': [RemoteRepoFetchState]
}

interface CancelParams {
    id: string // actuall: string | number
}

interface CompletionItemParams {
    completionID: string
}

export interface AutocompleteParams {
    uri: string
    filePath?: string | undefined | null
    position: Position
    // Defaults to 'Automatic' for autocompletions which were not explicitly
    // triggered.
    triggerKind?: 'Automatic' | 'Invoke' | undefined | null
    selectedCompletionInfo?: SelectedCompletionInfo | undefined | null
}

interface SelectedCompletionInfo {
    readonly range: Range
    readonly text: string
}

export interface ChatExportResult {
    chatID: string
    transcript: SerializedChatTranscript
}
export interface AutocompleteResult {
    items: AutocompleteItem[]

    /** completionEvent is not deprecated because it's used by non-editor clients like cody-bench that need access to book-keeping data to evaluate results. */
    completionEvent?: CompletionBookkeepingEvent | undefined | null
}

export interface AutocompleteItem {
    id: string
    insertText: string
    range: Range
}

export interface ClientInfo {
    name: string
    version: string // extension version
    ideVersion?: string | undefined | null
    workspaceRootUri: string

    /** @deprecated Use `workspaceRootUri` instead. */
    workspaceRootPath?: string | undefined | null

    extensionConfiguration?: ExtensionConfiguration | undefined | null
    capabilities?: ClientCapabilities | undefined | null

    /**
     * Optional tracking attributes to inject into telemetry events recorded
     * by the agent.
     */
    marketingTracking?: TelemetryEventMarketingTrackingInput | undefined | null
}

// The capability should match the name of the JSON-RPC methods.
export interface ClientCapabilities {
    completions?: 'none' | undefined | null
    //  When 'streaming', handles 'chat/updateMessageInProgress' streaming notifications.
    chat?: 'none' | 'streaming' | undefined | null
    // TODO: allow clients to implement the necessary parts of the git extension.
    // https://github.com/sourcegraph/cody/issues/4165
    git?: 'none' | 'enabled' | undefined | null
    // If 'enabled', the client must implement the progress/start,
    // progress/report, and progress/end notification endpoints.
    progressBars?: 'none' | 'enabled' | undefined | null
    edit?: 'none' | 'enabled' | undefined | null
    editWorkspace?: 'none' | 'enabled' | undefined | null
    untitledDocuments?: 'none' | 'enabled' | undefined | null
    showDocument?: 'none' | 'enabled' | undefined | null
    codeLenses?: 'none' | 'enabled' | undefined | null
    showWindowMessage?: 'notification' | 'request' | undefined | null
    ignore?: 'none' | 'enabled' | undefined | null
    codeActions?: 'none' | 'enabled' | undefined | null
    // When 'object-encoded' (default), the server uses the `webview/postMessage` method
    // to send structured JSON objects.  When 'string-encoded', the server uses the
    // `webview/postMessageStringEncoded` method to send a JSON-encoded string. This is
    // convenient for clients that forward the string directly to an underlying
    // webview container.
    webviewMessages?: 'object-encoded' | 'string-encoded' | undefined | null
    // Whether the client supports the VSCode WebView API. If 'agentic', uses
    // AgentWebViewPanel which just delegates bidirectional postMessage over
    // the Agent protocol. If 'native', implements a larger subset of the VSCode
    // WebView API.
    webview?:
        | 'agentic'
        | { type: 'native'; cspSource: string; webviewBundleServingPrefix: string }
        | undefined
        | null
}

export interface ServerInfo {
    name: string
    authenticated?: boolean | undefined | null
    codyEnabled?: boolean | undefined | null
    codyVersion?: string | undefined | null
    authStatus?: AuthStatus | undefined | null
}

export interface ExtensionConfiguration {
    serverEndpoint: string
    proxy?: string | undefined | null
    accessToken: string
    customHeaders: Record<string, string>

    /**
     * anonymousUserID is an important component of telemetry events that get
     * recorded. It is currently optional for backwards compatibility, but
     * it is strongly recommended to set this when connecting to Agent.
     */
    anonymousUserID?: string | undefined | null

    autocompleteAdvancedProvider?: string | undefined | null
    autocompleteAdvancedModel?: string | undefined | null
    debug?: boolean | undefined | null
    verboseDebug?: boolean | undefined | null
    telemetryClientName?: string | undefined | null
    codebase?: string | undefined | null

    /**
     * When passed, the Agent will handle recording events.
     * If not passed, client must send `graphql/logEvent` requests manually.
     * @deprecated This is only used for the legacy logEvent - use `telemetry` instead.
     */
    eventProperties?: EventProperties | undefined | null

    customConfiguration?: Record<string, any> | undefined | null

    baseGlobalState?: Record<string, any> | undefined | null
}

/**
 * TelemetryEvent is a JSON RPC format of the arguments to a typical
 * TelemetryEventRecorder implementation from '@sourcegraph/telemetry'.
 * This type is intended for use in the Agent RPC handler only - clients sending
 * events to the Agent should use 'newTelemetryEvent()' to create event objects,
 * which uses the same type constraints as '(TelemetryEventRecorder).recordEvent()'.
 * @param feature must be camelCase and '.'-delimited, e.g. 'myFeature.subFeature'.
 * Features should NOT include the client platform, e.g. 'vscode' - information
 * about the client is automatically attached to all events. Note that Cody
 * events MUST have provide feature 'cody' or have a feature prefixed with
 * 'cody.' to be considered Cody events.
 * @param action must be camelCase and simple, e.g. 'submit', 'failed', or
 * 'success', in the context of feature.
 * @param parameters should be as described in {@link TelemetryEventParameters}.
 */
interface TelemetryEvent {
    feature: string
    action: string
    parameters?:
        | TelemetryEventParameters<{ [key: string]: number }, BillingProduct, BillingCategory>
        | undefined
        | null
}

/**
 * newTelemetryEvent is a constructor for TelemetryEvent that shares the same
 * type constraints as '(TelemetryEventRecorder).recordEvent()'.
 */
export function newTelemetryEvent<
    Feature extends string,
    Action extends string,
    MetadataKey extends string,
>(
    feature: KnownString<Feature>,
    action: KnownString<Action>,
    parameters?: TelemetryEventParameters<
        KnownKeys<MetadataKey, { [key in MetadataKey]: number }>,
        BillingProduct,
        BillingCategory
    >
): TelemetryEvent {
    return { feature, action, parameters }
}

/**
 * @deprecated EventProperties are no longer referenced.
 */
interface EventProperties {
    /**
     * @deprecated Use (ExtensionConfiguration).anonymousUserID instead
     */
    anonymousUserID: string

    /** Event prefix, like 'CodyNeovimPlugin' */
    prefix: string

    /** Name of client, like 'NEOVIM_CODY_EXTENSION' */
    client: string

    /** Source type enum*/
    source: 'IDEEXTENSION'
}

export interface Position {
    // 0-indexed
    line: number
    // 0-indexed
    character: number
}

export interface Range {
    start: Position
    end: Position
}

export interface ProtocolTextDocument {
    // Use TextDocumentWithUri.fromDocument(TextDocument) if you want to parse this `uri` property.
    uri: string
    /** @deprecated use `uri` instead. This property only exists for backwards compatibility during the migration period. */
    filePath?: string | undefined | null
    content?: string | undefined | null
    selection?: Range | undefined | null
    contentChanges?: ProtocolTextDocumentContentChangeEvent[] | undefined | null
    visibleRange?: Range | undefined | null

    // Only used during testing. When defined, the agent server will
    // run additional validation to ensure that the document state of
    // the client is correctly synchronized with the docment state of
    // server.
    testing?:
        | {
              selectedText?: string | undefined | null
              sourceOfTruthDocument?: ProtocolTextDocument | undefined | null
          }
        | undefined
        | null
}

export interface ProtocolTextDocumentContentChangeEvent {
    range: Range
    text: string
}

interface ExecuteCommandParams {
    command: string
    arguments?: any[] | undefined | null
}

export interface DebugMessage {
    channel: string
    message: string
}

export interface ProgressStartParams {
    /** Unique ID for this operation. */
    id: string
    options: ProgressOptions
}
export interface ProgressReportParams {
    /** Unique ID for this operation. */
    id: string
    /** (optional) Text message to display in the progress bar */
    message?: string | undefined | null
    /**
     * (optional) increment to indicate how much percentage of the total
     * operation has been completed since the last report. The total % of the
     * job that is complete is the sum of all published increments. An increment
     * of 10 indicates '10%' of the progress has completed since the last
     * report. Can never be negative, and total can never exceed 100.
     */
    increment?: number | undefined | null
}
interface ProgressOptions {
    /**
     * A human-readable string which will be used to describe the
     * operation.
     */
    title?: string | undefined | null
    /**
     * The location at which progress should show.
     * Either `location` or `locationViewId` must be set
     */
    location?: string | undefined | null // one of: 'SourceControl' | 'Window' | 'Notification'
    /**
     * The location at which progress should show.
     * Either `location` or `locationViewId` must be set
     */
    locationViewId?: string | undefined | null

    /**
     * Controls if a cancel button should show to allow the user to
     * cancel the long running operation.  Note that currently only
     * `ProgressLocation.Notification` is supporting to show a cancel
     * button.
     */
    cancellable?: boolean | undefined | null
}

export interface WebviewPostMessageParams {
    id: string
    message: ExtensionMessage
}

export interface WorkspaceEditParams {
    operations: WorkspaceEditOperation[]
    metadata?: vscode.WorkspaceEditMetadata | undefined | null
}

export type WorkspaceEditOperation =
    | CreateFileOperation
    | RenameFileOperation
    | DeleteFileOperation
    | EditFileOperation

export interface WriteFileOptions {
    overwrite?: boolean | undefined | null
    ignoreIfExists?: boolean | undefined | null
}

export interface CreateFileOperation {
    type: 'create-file'
    uri: string
    options?: WriteFileOptions | undefined | null
    textContents: string
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}
export interface RenameFileOperation {
    type: 'rename-file'
    oldUri: string
    newUri: string
    options?: WriteFileOptions | undefined | null
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}
export interface DeleteFileOperation {
    type: 'delete-file'
    uri: string
    deleteOptions?:
        | {
              readonly recursive?: boolean | undefined | null
              readonly ignoreIfNotExists?: boolean | undefined | null
          }
        | undefined
        | null
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}
export interface EditFileOperation {
    type: 'edit-file'
    uri: string
    edits: TextEdit[]
}

export interface UntitledTextDocument {
    uri: string
    content?: string | undefined | null
    language?: string | undefined | null
}

export interface TextDocumentEditParams {
    uri: string
    edits: TextEdit[]
    options?: { undoStopBefore: boolean; undoStopAfter: boolean } | undefined | null
}

export interface TextDocumentShowOptionsParams {
    preserveFocus?: boolean | undefined | null
    preview?: boolean | undefined | null
    selection?: Range | undefined | null
}

export type TextEdit = ReplaceTextEdit | InsertTextEdit | DeleteTextEdit
export interface ReplaceTextEdit {
    type: 'replace'
    range: Range
    value: string
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}
export interface InsertTextEdit {
    type: 'insert'
    position: Position
    value: string
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}
export interface DeleteTextEdit {
    type: 'delete'
    range: Range
    metadata?: vscode.WorkspaceEditEntryMetadata | undefined | null
}

export interface WebviewCreatePanelParams {
    viewType: string
    title: string
    showOptions: vscode.ViewColumn | { preserveFocus: boolean; viewColumn: vscode.ViewColumn }
    options?: {
        enableFindWidget?: boolean
        retainContextWhenHidden?: boolean
        enableCommandUris?: boolean
        enableForms?: boolean
        enableScripts?: boolean
        localResourceRoots?: readonly vscode.Uri[]
        portMapping?: readonly { extensionHostPort: number; webviewPort: number }[]
    }
}

export interface WebviewCreatePanelResult {
    panelId: string
}

export interface EditTask {
    id: string
    state: CodyTaskState
    error?: CodyError | undefined | null
    selectionRange: Range
    instruction?: string | undefined | null
    model?: string | undefined | null
    originalText?: string | undefined | null
}

export interface CodyError {
    message: string
    cause?: CodyError | undefined | null
    stack?: string | undefined | null
}

export interface DisplayCodeLensParams {
    uri: string
    codeLenses: ProtocolCodeLens[]
}

export interface ProtocolCodeLens {
    range: Range
    command?: ProtocolCommand | undefined | null
    isResolved: boolean
}

export interface ProtocolCommand {
    title: {
        text: string
        icons: {
            value: string
            position: number
        }[]
    }
    command: string
    tooltip?: string | undefined | null
    arguments?: any[] | undefined | null
}

export interface NetworkRequest {
    url: string
    body?: string | undefined | null
    error?: string | undefined | null
}

export interface ShowWindowMessageParams {
    severity: 'error' | 'warning' | 'information'
    message: string
    options?: vscode.MessageOptions | undefined | null
    items?: string[] | undefined | null
}

interface FileIdentifier {
    uri: string
}

export interface DeleteFilesParams {
    files: FileIdentifier[]
}
export interface CreateFilesParams {
    files: FileIdentifier[]
}
interface RenameFile {
    oldUri: string
    newUri: string
}
export interface RenameFilesParams {
    files: RenameFile[]
}

export type CustomCommandResult = CustomChatCommandResult | CustomEditCommandResult
export interface CustomChatCommandResult {
    type: 'chat'
    chatResult: string
}
export interface CustomEditCommandResult {
    type: 'edit'
    editResult: EditTask
}

export interface GetFoldingRangeParams {
    uri: string
    range: Range
}

export interface GetFoldingRangeResult {
    range: Range
}

export interface RemoteRepoFetchState {
    state: 'paused' | 'fetching' | 'errored' | 'complete'
    error?: CodyError | undefined | null
}

// Copy-pasted from @types/node
export interface MemoryUsage {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
    arrayBuffers: number
}

export interface ProtocolLocation {
    uri: string
    range: Range
}

export interface ProtocolDiagnostic {
    location: ProtocolLocation
    message: string
    severity: DiagnosticSeverity
    code?: string | undefined | null
    source?: string | undefined | null
    relatedInformation?: ProtocolRelatedInformationDiagnostic[] | undefined | null
}

export interface ProtocolRelatedInformationDiagnostic {
    location: ProtocolLocation
    message: string
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'suggestion'
export type CodeActionTriggerKind = 'Invoke' | 'Automatic'
export interface ProtocolCodeAction {
    // Randomly generated ID of this code action that should be referenced in
    // the `codeActions/trigger` request. In codeActions/trigger, you can only
    // reference IDs from the most recent response from codeActions/provide.
    // IDs from old codeActions/provide results are invalidated as soon as you
    // send a new codeActions/provide request.
    id: string
    // Stable string ID of the VS Code command that will be triggered if you
    // send a request to codeActions/trigger. Use this ID over `title`
    commandID?: string | undefined | null
    title: string
    diagnostics?: ProtocolDiagnostic[] | undefined | null
    kind?: string | undefined | null
    isPreferred?: boolean | undefined | null
    disabled?:
        | {
              /**
               * Human readable description of why the code action is currently disabled.
               *
               * This is displayed in the code actions UI.
               */
              readonly reason: string
          }
        | undefined
        | null
}

/**
 * Omitting uris parameter will retrieve all open documents for the
 * current workspace root.
 */
export interface GetDocumentsParams {
    uris?: string[] | undefined | null
}

export interface GetDocumentsResult {
    documents: ProtocolTextDocument[]
}

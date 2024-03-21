import type {
    AuthStatus,
    BillingCategory,
    BillingProduct,
    ChatMessage,
    CurrentUserCodySubscription,
    ModelProvider,
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

    // Similar to `chat/new` except it starts a new chat session from an
    // existing transcript. The chatID matches the `chatID` property of the
    // `type: 'transcript'` ExtensionMessage that is sent via
    // `webview/postMessage`. Returns a new *panel* ID, which can be used to
    // send a chat message via `chat/submitMessage`.
    'chat/restore': [{ modelID?: string | null; messages: ChatMessage[]; chatID: string }, string]

    'chat/models': [{ id: string }, { models: ModelProvider[] }]
    'chat/remoteRepos': [{ id: string }, { remoteRepos?: Repo[] }]

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

    // Trigger commands that edit the code.
    'editCommands/code': [{ params: { instruction: string } }, EditTask]
    'editCommands/test': [null, EditTask]
    'commands/document': [null, EditTask] // TODO: rename to editCommands/document

    // If the task is "applied", discards the task.
    'editTask/accept': [FixupTaskID, null]
    // If the task is "applied", attempts to revert the task's edit, then
    // discards the task.
    'editTask/undo': [FixupTaskID, null]
    // Discards the task. Applicable to tasks in any state.
    'editTask/cancel': [FixupTaskID, null]

    // Utility for clients that don't have language-neutral folding-range support.
    // Provides a list of all the computed folding ranges in the specified document.
    'editTask/getFoldingRanges': [GetFoldingRangeParams, GetFoldingRangeResult]

    // Low-level API to trigger a VS Code command with any argument list. Avoid
    // using this API in favor of high-level wrappers like 'chat/new'.
    'command/execute': [ExecuteCommandParams, any]

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
    /**
     * Checks if a given set of URLs includes a Cody ignored file.
     */
    'check/isCodyIgnoredFile': [{ urls: string[] }, boolean]

    'git/codebaseName': [{ url: string }, string | null]

    // High-level API to allow the agent to clean up resources related to a
    // webview ID (from chat/new).
    'webview/didDispose': [{ id: string }, null]

    // Low-level API to send a raw WebviewMessage from a specific webview (chat
    // session).  Refrain from using this API in favor of high-level APIs like
    // `chat/submitMessage`.
    'webview/receiveMessage': [{ id: string; message: WebviewMessage }, null]

    // Only used for testing purposes. If you want to write an integration test
    // for dealing with progress bars then you can send a request to this
    // endpoint to emulate the scenario where the server creates a progress bar.
    'testing/progress': [{ title: string }, { result: string }]
    'testing/networkRequests': [null, { requests: NetworkRequest[] }]
    'testing/requestErrors': [null, { errors: NetworkRequest[] }]
    'testing/closestPostData': [{ url: string; postData: string }, { closestBody: string }]

    // Only used for testing purposes. This operation runs indefinitely unless
    // the client sends progress/cancel.
    'testing/progressCancelation': [{ title: string }, { result: string }]

    // Only used for testing purposes. Does a best-effort to reset the state
    // if the agent server. For example, closes all open documents.
    'testing/reset': [null, null]

    // Updates the extension configuration and returns the new
    // authentication status, which indicates whether the provided credentials are
    // valid or not. The agent can't support autocomplete or chat if the credentials
    // are invalid.
    'extensionConfiguration/change': [ExtensionConfiguration, AuthStatus | null]

    // Returns the current authentication status without making changes to it.
    'extensionConfiguration/status': [null, AuthStatus | null]

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
            error: string | null
            repoNames: string[]
            limitHit: boolean
        },
    ]
}

// ================
// Server -> Client
// ================
export type ServerRequests = {
    'window/showMessage': [ShowWindowMessageParams, string | null]

    'textDocument/edit': [TextDocumentEditParams, boolean]
    'textDocument/openUntitledDocument': [UntitledTextDocument, boolean]
    'textDocument/show': [{ uri: string; options?: vscode.TextDocumentShowOptions }, boolean]
    'workspace/edit': [WorkspaceEditParams, boolean]

    // Low-level API to handle requests from the VS Code extension to create a
    // webview.  This endpoint should not be needed as long as you use
    // high-level APIs like chat/new instead. This API only exists to faithfully
    // expose the VS Code webview API.
    'webview/create': [{ id: string; data: any }, null]
}

// The JSON-RPC notifications of the Cody Agent protocol. Notifications are
// synchronous fire-and-forget messages that have no return value. Notifications are
// conventionally used to represent streams of values.
export type Notifications = ClientNotifications & ServerNotifications

// ================
// Client -> Server
// ================
export type ClientNotifications = {
    // The 'initalized' notification must be sent after receiving the 'initialize' response.
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

    // Low-level webview notification for the given chat session ID (created via
    // chat/new). Subscribe to these messages to get access to streaming updates
    // on the chat reply.
    'webview/postMessage': [WebviewPostMessageParams]

    'progress/start': [ProgressStartParams]

    // Update about an ongoing progress bar from progress/create. This
    // notification can only be sent from the server while the progress/create
    // request has not finished responding.
    'progress/report': [ProgressReportParams]

    'progress/end': [{ id: string }]
}

interface CancelParams {
    id: string // actuall: string | number
}

interface CompletionItemParams {
    completionID: string
}

interface AutocompleteParams {
    uri: string
    filePath?: string
    position: Position
    // Defaults to 'Automatic' for autocompletions which were not explicitly
    // triggered.
    triggerKind?: 'Automatic' | 'Invoke'
    selectedCompletionInfo?: SelectedCompletionInfo
}

interface SelectedCompletionInfo {
    readonly range: Range
    readonly text: string
}
export interface AutocompleteResult {
    items: AutocompleteItem[]

    /** completionEvent is not deprecated because it's used by non-editor clients like evaluate-autocomplete that need access to book-keeping data to evaluate results. */
    completionEvent?: CompletionBookkeepingEvent
}

export interface AutocompleteItem {
    id: string
    insertText: string
    range: Range
}

export interface ClientInfo {
    name: string
    version: string
    workspaceRootUri: string

    /** @deprecated Use `workspaceRootUri` instead. */
    workspaceRootPath?: string

    extensionConfiguration?: ExtensionConfiguration
    capabilities?: ClientCapabilities

    /**
     * Optional tracking attributes to inject into telemetry events recorded
     * by the agent.
     */
    marketingTracking?: TelemetryEventMarketingTrackingInput
}

interface ClientCapabilities {
    completions?: 'none'
    //  When 'streaming', handles 'chat/updateMessageInProgress' streaming notifications.
    chat?: 'none' | 'streaming'
    git?: 'none' | 'disabled'
    // If 'enabled', the client must implement the progress/start,
    // progress/report, and progress/end notification endpoints.
    progressBars?: 'none' | 'enabled'
    edit?: 'none' | 'enabled'
    editWorkspace?: 'none' | 'enabled'
    untitledDocuments?: 'none' | 'enabled'
    showDocument?: 'none' | 'enabled'
    codeLenses?: 'none' | 'enabled'
    showWindowMessage?: 'notification' | 'request'
}

export interface ServerInfo {
    name: string
    authenticated?: boolean
    codyEnabled?: boolean
    codyVersion?: string | null
    authStatus?: AuthStatus
}

export interface ExtensionConfiguration {
    serverEndpoint: string
    proxy?: string | null
    accessToken: string
    customHeaders: Record<string, string>

    /**
     * anonymousUserID is an important component of telemetry events that get
     * recorded. It is currently optional for backwards compatibility, but
     * it is strongly recommended to set this when connecting to Agent.
     */
    anonymousUserID?: string

    autocompleteAdvancedProvider?: string
    autocompleteAdvancedModel?: string | null
    debug?: boolean
    verboseDebug?: boolean
    codebase?: string

    /**
     * When passed, the Agent will handle recording events.
     * If not passed, client must send `graphql/logEvent` requests manually.
     * @deprecated This is only used for the legacy logEvent - use `telemetry` instead.
     */
    eventProperties?: EventProperties

    customConfiguration?: Record<string, any>
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
    parameters?: TelemetryEventParameters<{ [key: string]: number }, BillingProduct, BillingCategory>
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
    filePath?: string
    content?: string
    selection?: Range
}

interface ExecuteCommandParams {
    command: string
    arguments?: any[]
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
    message?: string
    /**
     * (optional) increment to indicate how much percentage of the total
     * operation has been completed since the last report. The total % of the
     * job that is complete is the sum of all published increments. An increment
     * of 10 indicates '10%' of the progress has completed since the last
     * report. Can never be negative, and total can never exceed 100.
     */
    increment?: number
}
interface ProgressOptions {
    /**
     * A human-readable string which will be used to describe the
     * operation.
     */
    title?: string
    /**
     * The location at which progress should show.
     * Either `location` or `locationViewId` must be set
     */
    location?: string // one of: 'SourceControl' | 'Window' | 'Notification'
    /**
     * The location at which progress should show.
     * Either `location` or `locationViewId` must be set
     */
    locationViewId?: string

    /**
     * Controls if a cancel button should show to allow the user to
     * cancel the long running operation.  Note that currently only
     * `ProgressLocation.Notification` is supporting to show a cancel
     * button.
     */
    cancellable?: boolean
}

export interface WebviewPostMessageParams {
    id: string
    message: ExtensionMessage
}

export interface WorkspaceEditParams {
    operations: WorkspaceEditOperation[]
    metadata?: vscode.WorkspaceEditMetadata
}

export type WorkspaceEditOperation =
    | CreateFileOperation
    | RenameFileOperation
    | DeleteFileOperation
    | EditFileOperation

export interface WriteFileOptions {
    overwrite?: boolean
    ignoreIfExists?: boolean
}

export interface CreateFileOperation {
    type: 'create-file'
    uri: string
    options?: WriteFileOptions
    textContents: string
    metadata?: vscode.WorkspaceEditEntryMetadata
}
export interface RenameFileOperation {
    type: 'rename-file'
    oldUri: string
    newUri: string
    options?: WriteFileOptions
    metadata?: vscode.WorkspaceEditEntryMetadata
}
export interface DeleteFileOperation {
    type: 'delete-file'
    uri: string
    deleteOptions?: {
        readonly recursive?: boolean
        readonly ignoreIfNotExists?: boolean
    }
    metadata?: vscode.WorkspaceEditEntryMetadata
}
export interface EditFileOperation {
    type: 'edit-file'
    uri: string
    edits: TextEdit[]
}

export interface UntitledTextDocument {
    uri: string
    content?: string
    language?: string
}

export interface TextDocumentEditParams {
    uri: string
    edits: TextEdit[]
    options?: { undoStopBefore: boolean; undoStopAfter: boolean }
}
export type TextEdit = ReplaceTextEdit | InsertTextEdit | DeleteTextEdit
export interface ReplaceTextEdit {
    type: 'replace'
    range: Range
    value: string
    metadata?: vscode.WorkspaceEditEntryMetadata
}
export interface InsertTextEdit {
    type: 'insert'
    position: Position
    value: string
    metadata?: vscode.WorkspaceEditEntryMetadata
}
export interface DeleteTextEdit {
    type: 'delete'
    range: Range
    metadata?: vscode.WorkspaceEditEntryMetadata
}

export interface EditTask {
    id: string
    state: CodyTaskState
    error?: CodyError
    selectionRange: Range
}

export interface CodyError {
    message: string
    cause?: CodyError
    stack?: string
}

export interface DisplayCodeLensParams {
    uri: string
    codeLenses: ProtocolCodeLens[]
}

export interface ProtocolCodeLens {
    range: Range
    command?: ProtocolCommand
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
    tooltip?: string
    arguments?: any[]
}

export interface NetworkRequest {
    url: string
    body?: string
    error?: string
}

export interface ShowWindowMessageParams {
    severity: 'error' | 'warning' | 'information'
    message: string
    options?: vscode.MessageOptions
    items?: string[]
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
}

export interface GetFoldingRangeResult {
    ranges: Range[]
}

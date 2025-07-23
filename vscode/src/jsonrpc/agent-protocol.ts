import type * as vscode from 'vscode'

import type {
    ClientCapabilities,
    CodyCommand,
    ContextFilters,
    Model,
    ModelAvailabilityStatus,
    ModelUsage,
    Rule,
    SerializedChatTranscript,
} from '@sourcegraph/cody-shared'
import type { TelemetryEventMarketingTrackingInput } from '@sourcegraph/telemetry'

import type { AuthError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import type { AutoeditRequestStateForAgentTesting } from '../autoedits/analytics-logger'
import type { DecorationInfo } from '../autoedits/renderer/decorators/base'
import type { ExtensionMessage, WebviewMessage } from '../chat/protocol'
import type { CompletionBookkeepingEvent, CompletionItemID } from '../completions/analytics-logger'
import type { FixupTaskID } from '../non-stop/FixupTask'
import type { CodyTaskState } from '../non-stop/state'

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

    // Start a new chat session and returns panel id and chat id that later can
    // be used to reference to the session with panel id and restore chat with
    // chat id. Main difference compared to the chat/new and chat/web/new is that
    // the panel has sidebar webview type instead of editor webview type.
    'chat/sidebar/new': [null, { panelId: string; chatId: string }]

    // Deletes chat by its ID and returns newly updated chat history list
    // Primary is used only in cody web client
    'chat/delete': [{ chatId: string }, ChatExportResult[]]

    'chat/models': [{ modelUsage: ModelUsage }, { readOnly: boolean; models: ModelAvailabilityStatus[] }]
    'chat/export': [null | { fullHistory: boolean }, ChatExportResult[]]

    // history is Map of {endpoint}-{username} to chat transcripts by date
    'chat/import': [
        { history: Record<string, Record<string, SerializedChatTranscript>>; merge: boolean },
        null,
    ]

    // High-level wrapper around webview/receiveMessage and webview/postMessage
    // to submit a chat message. The ID is the return value of chat/id, and the
    // message is forwarded verbatim via webview/receiveMessage. This helper
    // abstracts over the low-level webview notifications so that you can await
    // on the request.  Subscribe to webview/postMessage to stream the reply
    // while awaiting on this response.
    'chat/submitMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]
    'chat/editMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]

    'chat/setModel': [{ id: string; model: Model['id'] }, null]

    // Trigger chat-based commands (explain, test, smell), which are effectively
    // shortcuts to start a new chat with a templated question. The return value
    // of these commands is the same as `chat/new`, an ID to reference to the
    // webview panel where the reply from this command appears.
    'commands/explain': [null, string] // TODO: rename to chatCommands/{explain,test,smell}
    'commands/smell': [null, string]

    // Trigger custom commands that could be a chat-based command or an edit command.
    'commands/custom': [{ key: string }, CustomCommandResult]

    // A list of available custom commands stored in .cody/commands.json.
    'customCommands/list': [null, CodyCommand[]]

    // Trigger commands that edit the code.
    'editTask/start': [null, FixupTaskID | undefined | null]
    // If the task is "applied", discards the task.
    'editTask/accept': [FixupTaskID, null]
    // If the task is "applied", attempts to revert the task's edit, then
    // discards the task.
    'editTask/undo': [FixupTaskID, null]
    // Discards the task. Applicable to tasks in any state.
    'editTask/cancel': [FixupTaskID, null]
    'editTask/retry': [FixupTaskID, FixupTaskID | undefined | null]
    'editTask/getTaskDetails': [FixupTaskID, EditTask]

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
    'codeActions/trigger': [FixupTaskID, FixupTaskID | undefined | null]

    'autocomplete/execute': [AutocompleteParams, AutocompleteResult]

    'graphql/getRepoIds': [{ names: string[]; first: number }, { repos: { name: string; id: string }[] }]

    'graphql/currentUserId': [null, string]

    'featureFlags/getFeatureFlag': [{ flagName: string }, boolean | null]

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

    // Implements the VSCode Webview View API. Called when the client has
    // created a native webview for the specified view provider.
    'webview/resolveWebviewView': [{ viewId: string; webviewHandle: string }, null]

    // Low-level API to send a raw WebviewMessage from a specific webview (chat
    // session).  Refrain from using this API in favor of high-level APIs like
    // `chat/submitMessage` unless using native webviews.
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
    'testing/exportedTelemetryEvents': [null, { events: TestingTelemetryEvent[] }]
    'testing/networkRequests': [null, { requests: NetworkRequest[] }]
    'testing/requestErrors': [null, { errors: NetworkRequest[] }]
    'testing/closestPostData': [{ url: string; postData: string }, { closestBody: string }]
    'testing/memoryUsage': [null, { usage: MemoryUsage }]
    'testing/heapdump': [null, null]
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

    'testing/autocomplete/autoeditEvent': [
        CompletionItemParams,
        AutoeditRequestStateForAgentTesting | undefined | null,
    ]

    // For testing a short delay we give users for reading the completion
    // and deciding whether to accept it.
    'testing/autocomplete/awaitPendingVisibilityTimeout': [null, CompletionItemID | undefined]

    // For testing purposes, sets the minimum time given to users for reading and deciding
    // whether to accept a completion.
    'testing/autocomplete/setCompletionVisibilityDelay': [{ delay: number }, null]

    // For testing purposes, returns the current autocomplete provider configuration.
    'testing/autocomplete/providerConfig': [
        null,
        { id: string; legacyModel: string; configSource: string } | null | undefined,
    ]

    // Updates the extension configuration and returns the new
    // authentication status, which indicates whether the provided credentials are
    // valid or not. The agent can't support autocomplete or chat if the credentials
    // are invalid.
    'extensionConfiguration/change': [ExtensionConfiguration, ProtocolAuthStatus | null]

    // Returns the current authentication status without making changes to it.
    'extensionConfiguration/status': [null, ProtocolAuthStatus | null]

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

    // Called after the extension has been uninstalled by a user action.
    // Attempts to wipe out any state that the extension has stored.
    'extension/reset': [null, null]

    'internal/getAuthHeaders': [string, Record<string, string>]
}

// ================
// Server -> Client
// ================
export type ServerRequests = {
    'window/showMessage': [ShowWindowMessageParams, string | null]
    'window/showSaveDialog': [SaveDialogOptionsParams, string | undefined | null]

    'textDocument/edit': [TextDocumentEditParams, boolean]
    'textDocument/show': [
        {
            uri: string
            options?: TextDocumentShowOptionsParams | undefined | null
        },
        boolean,
    ]

    'textEditor/selection': [{ uri: string; selection: Range }, null]
    'textEditor/revealRange': [{ uri: string; range: Range }, null]

    'workspace/edit': [WorkspaceEditParams, boolean]

    'secrets/get': [{ key: string }, string | null | undefined]
    'secrets/store': [{ key: string; value: string }, null | undefined]
    'secrets/delete': [{ key: string }, null | undefined]

    // TODO: Add VSCode support for registerWebviewPanelSerializer.

    'env/openExternal': [{ uri: string }, boolean]

    'editTask/getUserInput': [UserEditPromptRequest, UserEditPromptResult | undefined | null]
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

    // Provide an updated list of workspace folders when changed.
    // Put the most recently opened folder first.
    'workspaceFolder/didChange': [{ uris: string[] }]

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
    // The user renamed a document.
    'textDocument/didRename': [{ oldUri: string; newUri: string }]
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

    // Testing notification to run code in the agent process
    'testing/runInAgent': [string]

    // Native webviews use handles that are an implementation detail of Agent's
    // vscode shim, unrelated to the application-level IDs from chat/new.
    // Consequently they have their own dispose notification. c.f.
    // webview/dispose client request.
    'webview/didDisposeNative': [{ handle: string }]

    'secrets/didChange': [{ key: string }]

    'window/didChangeFocus': [{ focused: boolean }]

    'testing/resetStorage': [null]
}

// ================
// Server -> Client
// ================
export type ServerNotifications = {
    /**
     * Notification sent when the inline completion should be hidden.
     * This is complementary, clients should listen to this notifcation in addition to providing their
     * own logic for hiding completions (e.g. on user types or user triggers keybinding).
     */
    'autocomplete/didHide': [null]
    /**
     * Notification sent when the inline completion should be triggered.
     * This is complementary, clients should listen to this notifcation in addition to providing their
     * own logic for triggering completions (e.g. on user types or user triggers keybinding).
     *
     * An example where this will be used, is in cases where we want to explictly trigger an autocomplete due
     * to some internal logic. For example, we trigger certain completions on cursor movements, but only under certain
     * conditions (no existing suggestion, recent change in the document). This notification will be fired instead of
     * requiring that the client duplicates this logic.
     */
    'autocomplete/didTrigger': [null]

    'debug/message': [DebugMessage]

    'extensionConfiguration/didUpdate': [{ key: string; value?: string | undefined | null }]
    'extensionConfiguration/openSettings': [null]

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

    // Clients with 'native' webview capability.
    'webview/registerWebviewViewProvider': [
        {
            viewId: string
            retainContextWhenHidden: boolean
        },
    ]
    'webview/createWebviewPanel': [
        {
            handle: string
            viewType: string
            title: string
            showOptions: {
                preserveFocus: boolean
                viewColumn: number
            }
            // VSCode API 'options' but bindings generator does not handle fields
            // with the same name.
            options: WebviewCreateWebviewPanelOptions
        },
    ]
    'webview/dispose': [{ handle: string }]
    'webview/reveal': [{ handle: string; viewColumn: number; preserveFocus: boolean }]
    'webview/setTitle': [{ handle: string; title: string }]
    'webview/setIconPath': [{ handle: string; iconPathUri?: string | null | undefined }]
    'webview/setOptions': [{ handle: string; options: DefiniteWebviewOptions }]
    'webview/setHtml': [{ handle: string; html: string }]

    // When the when-claude context has changed.
    // For example, 'cody.activated' is set based on user's latest authentication status.
    'window/didChangeContext': [{ key: string; value?: string | undefined | null }]
    // Client should move the focus to the sidebar.
    'window/focusSidebar': [null]

    // Update about current authentication status.
    'authStatus/didUpdate': [ProtocolAuthStatus]
}

export interface WebviewCreateWebviewPanelOptions {
    enableScripts: boolean
    enableForms: boolean
    // Note, here, null has a surprising interpretation of "all commands are enabled"
    // whereas an empty array means no commands are enabled. This lets us model all
    // states (all enabled, all disabled, only specific commands enabled) with one
    // field and avoid any redundant or inconsistent states.
    enableOnlyCommandUris?: readonly string[] | undefined | null
    // Note, we model "missing" here because interpreting the default
    // depends on the current workspace root.
    localResourceRoots?: readonly string[] | undefined | null // Note, in vscode, ? readonly Uri[]
    portMapping: readonly { webviewPort: number; extensionHostPort: number }[]
    // WebviewPanelOptions
    enableFindWidget: boolean
    retainContextWhenHidden: boolean
}

/**
 * vscode.WebviewOptions with defaults applied so each option is present. Agent
 * native webviews use this type so defaults are handled in TypeScript and the
 * client simply interprets the fully specified options.
 */
export interface DefiniteWebviewOptions {
    enableScripts: boolean
    enableForms: boolean
    enableOnlyCommandUris?: readonly string[] | undefined | null
    localResourceRoots?: readonly string[] | undefined | null
    portMapping: readonly { webviewPort: number; extensionHostPort: number }[]
    enableFindWidget: boolean
    retainContextWhenHidden: boolean
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

export interface AutoeditImageDiff {
    /* Base64 encoded image suitable for rendering in dark editor themes */
    dark: string
    /* Base64 encoded image suitable for rendering in light editor themes */
    light: string
    /**
     * The pixel ratio used to generate the image. Should be used to scale the image appropriately.
     * Has a minimum value of 1.
     */
    pixelRatio: number
    /**
     * The position in which the image should be rendered in the editor.
     */
    position: { line: number; column: number }
}

export interface AutoeditChanges {
    type: 'insert' | 'delete'
    range: vscode.Range
    text?: string | null | undefined
}

export type AutoeditTextDiff = DecorationInfo

export interface AutocompleteEditItem {
    id: string
    range: Range
    insertText: string
    originalText: string
    render: {
        inline: {
            changes?: AutoeditChanges[] | null | undefined
        }
        aside: {
            image?: AutoeditImageDiff | null | undefined
            diff?: AutoeditTextDiff | null | undefined
        }
    }
}

export interface AutocompleteItem {
    id: string
    range: Range
    insertText: string
}

export interface AutocompleteResult {
    /** @deprecated Use `inlineCompletionItems` instead. */
    items: AutocompleteItem[]
    inlineCompletionItems: AutocompleteItem[]
    decoratedEditItems: AutocompleteEditItem[]
    completionEvent?: CompletionBookkeepingEvent | undefined | null
}

export interface ClientInfo {
    name: string
    version: string // extension version
    ideVersion?: string | undefined | null
    workspaceRootUri: string
    globalStateDir?: string | undefined | null

    /** @deprecated Use `workspaceRootUri` instead. */
    workspaceRootPath?: string | undefined | null

    extensionConfiguration?: ExtensionConfiguration | undefined | null
    capabilities?: ClientCapabilities | undefined | null

    /**
     * Optional tracking attributes to inject into telemetry events recorded
     * by the agent.
     */
    marketingTracking?: TelemetryEventMarketingTrackingInput | undefined | null

    /**
     * Used to identify the client with legacy servers as a different IDE (typically JetBrains).
     * Pre 5.6, servers would reject any client it did not recognize.
     */
    legacyNameForServerIdentification?: string | undefined | null
}

export interface ServerInfo {
    name: string
    authenticated?: boolean | undefined | null
    authStatus?: ProtocolAuthStatus | undefined | null
}

export interface ExtensionConfiguration {
    serverEndpoint?: string | undefined | null
    proxy?: string | undefined | null
    accessToken?: string | undefined | null
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
     * @deprecated use 'customConfigurationJson' instead, it supports nested objects
     */
    customConfiguration?: Record<string, any> | undefined | null

    /**
     * Custom configuration is parsed using the same rules as VSCode's WorkspaceConfiguration:
     * https://code.visualstudio.com/api/references/vscode-api#WorkspaceConfiguration.get
     * That means it supports dotted names - keys can be nested and are merged based on the prefix.
     * Configuration objects from a nested settings can be obtained using dotted names.
     * For the examples look at the `AgentWorkspaceConfiguration.test.ts`
     */
    customConfigurationJson?: string | undefined | null

    baseGlobalState?: Record<string, any> | undefined | null
}

/**
 * TelemetryEvent is a JSON RPC format of the arguments to a typical
 * TelemetryEventRecorder implementation from '@sourcegraph/telemetry'.
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
    parameters: {
        metadata?: Record<string, number> | undefined | null
        privateMetadata?: Record<string, any> | undefined | null
        billingMetadata?:
            | {
                  product: string
                  category: string
              }
            | undefined
            | null
    }
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

// Equivalent to our internal `AuthStatus` type but using a string discriminator
// instead of a boolean discriminator. Boolean discriminators complicate
// deserializing in other languages. We have custom codegen for string
// discriminators but not boolean ones.
// It's good practice to be more intentional about the Agent protocol types
// anyways.  As a rule of thumb, we should try to avoid leaking internal types
// that are constantly making tiny changes that are irrelevant for the other
// clients anyways.
export type ProtocolAuthStatus = ProtocolAuthenticatedAuthStatus | ProtocolUnauthenticatedAuthStatus

export interface ProtocolAuthenticatedAuthStatus {
    status: 'authenticated'
    authenticated: boolean
    endpoint: string

    username: string

    /**
     * Used to enable Fireworks tracing for Sourcegraph teammates on DotCom.
     * https://readme.fireworks.ai/docs/enabling-tracing
     */
    isFireworksTracingEnabled?: boolean | null | undefined
    hasVerifiedEmail?: boolean | null | undefined
    requiresVerifiedEmail?: boolean | null | undefined

    primaryEmail?: string | null | undefined
    displayName?: string | null | undefined
    avatarURL?: string | null | undefined

    pendingValidation: boolean

    /**
     * Organizations on the instance that the user is a member of.
     */
    organizations?: { name: string; id: string }[] | null | undefined
}

export interface ProtocolUnauthenticatedAuthStatus {
    status: 'unauthenticated'
    authenticated: boolean
    endpoint: string
    error?: AuthError | null | undefined
    pendingValidation: boolean
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

export type DebugMessageLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export interface DebugMessage {
    channel: string
    message: string
    level?: DebugMessageLogLevel | undefined | null
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

export type WorkspaceEditOperation = CreateFileOperation | EditFileOperation

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
export interface EditFileOperation {
    type: 'edit-file'
    uri: string
    edits: TextEdit[]
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

export interface EditTask {
    id: string
    state: CodyTaskState
    error?: CodyError | undefined | null
    selectionRange: Range
    instruction?: string | undefined | null
    model?: string | undefined | null
    originalText?: string | undefined | null
    rules?: Rule[] | undefined | null
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
export interface TestingTelemetryEvent {
    feature: string
    action: string
    source: {
        client: string
        clientVersion: string
    }
    parameters: {
        metadata: Record<string, number>
        privateMetadata: Record<string, any>
        billingMetadata: {
            product: string
            category: string
        }
    }
    timestamp: string
    testOnlyAnonymousUserID?: string | null | undefined
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

export interface SaveDialogOptionsParams {
    defaultUri?: string | undefined | null
    saveLabel?: string | undefined | null
    filters?: Record<string, string[]> | undefined | null
    title?: string | undefined | null
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
    editResult?: FixupTaskID | undefined | null
}

export interface GetFoldingRangeParams {
    uri: string
    range: Range
}

export interface GetFoldingRangeResult {
    range: Range
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

export interface UserEditPromptRequest {
    instruction?: string | undefined | null
    selectedModelId: string
    availableModels: ModelAvailabilityStatus[]
}

export interface UserEditPromptResult {
    instruction: string
    selectedModelId: string
}

/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { type ChatModelProvider } from '@sourcegraph/cody-shared'
import type { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import type { ChatMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import type { event } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import type { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'
import type {
    KnownKeys,
    KnownString,
    TelemetryEventMarketingTrackingInput,
    TelemetryEventParameters,
} from '@sourcegraph/telemetry'

import type { ExtensionMessage, WebviewMessage } from '../chat/protocol'
import type { CompletionBookkeepingEvent, CompletionItemID } from '../completions/logger'

// This file documents the Cody Agent JSON-RPC protocol. Consult the JSON-RPC
// specification to learn about how JSON-RPC works https://www.jsonrpc.org/specification
// The Cody Agent server only supports transport via stdout/stdin.

// The JSON-RPC requests of the Cody Agent protocol. Requests are async
// functions that return some (possibly null) value.
export type Requests = {
    // ================
    // Client -> Server
    // ================

    // The 'initialize' request must be sent at the start of the connection
    // before any other request/notification is sent.
    initialize: [ClientInfo, ServerInfo]
    // The 'shutdown' request must be sent before terminating the agent process.
    shutdown: [null, null]

    // Client requests the agent server to lists all recipes that are supported
    // by the agent.
    'recipes/list': [null, RecipeInfo[]]
    // Client requests the agent server to execute an individual recipe.
    // The response is null because the AI/Assistant messages are streamed through
    // the chat/updateMessageInProgress notification. The flow to trigger a recipe
    // is like this:
    // client --- recipes/execute --> server
    // client <-- chat/updateMessageInProgress --- server
    //             ....
    // client <-- chat/updateMessageInProgress --- server
    'recipes/execute': [ExecuteRecipeParams, null]

    // Start a new chat session and returns a UUID that can be used to reference
    // this session in other requests like chat/submitMessage or
    // webview/didDispose.
    'chat/new': [null, string]

    // Similar to `chat/new` except it starts a new chat session from an
    // existing transcript. The chatID matches the `chatID` property of the
    // `type: 'transcript'` ExtensionMessage that is sent via
    // `webview/postMessage`. Returns a new *panel* ID, which can be used to
    // send a chat message via `chat/submitMessage`.
    'chat/restore': [{ modelID: string; messages: ChatMessage[]; chatID: string }, string]

    'chat/models': [{ id: string }, { models: ChatModelProvider[] }]

    // High-level wrapper around webview/receiveMessage and webview/postMessage
    // to submit a chat message. The ID is the return value of chat/id, and the
    // message is forwarded verbatim via webview/receiveMessage. This helper
    // abstracts over the low-level webview notifications so that you can await
    // on the request.  Subscribe to webview/postMessage to stream the reply
    // while awaiting on this response.
    'chat/submitMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]
    'chat/editMessage': [{ id: string; message: WebviewMessage }, ExtensionMessage]

    // Low-level API to trigger a VS Code command with any argument list. Avoid
    // using this API in favor of high-level wrappers like 'chat/new'.
    'command/execute': [ExecuteCommandParams, any]

    'autocomplete/execute': [AutocompleteParams, AutocompleteResult]

    'graphql/currentUserId': [null, string]

    'graphql/currentUserIsPro': [null, boolean]

    'featureFlags/getFeatureFlag': [{ flagName: string }, boolean | null]

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

    // Only used for testing purposes. If you want to write an integration test
    // for dealing with progress bars then you can send a request to this
    // endpoint to emulate the scenario where the server creates a progress bar.
    'testing/progress': [{ title: string }, { result: string }]

    // Only used for testing purposes. This operation runs indefinitely unless
    // the client sends progress/cancel.
    'testing/progressCancelation': [{ title: string }, { result: string }]

    // ================
    // Server -> Client
    // ================

    // Low-level API to handle requests from the VS Code extension to create a
    // webview.  This endpoint should not be needed as long as you use
    // high-level APIs like chat/new instead. This API only exists to faithfully
    // expose the VS Code webview API.
    'webview/create': [{ id: string; data: any }, null]
}

// The JSON-RPC notifications of the Cody Agent protocol. Notifications are
// synchronous fire-and-forget messages that have no return value. Notifications are
// conventionally used to represent streams of values.
export type Notifications = {
    // ================
    // Client -> Server
    // ================

    // The 'initalized' notification must be sent after receiving the 'initialize' response.
    initialized: [null]
    // The 'exit' notification must be sent after the client receives the 'shutdown' response.
    exit: [null]

    // The server should use the provided connection configuration for all
    // subsequent requests/notifications. The previous extension configuration
    // should no longer be used.
    'extensionConfiguration/didChange': [ExtensionConfiguration]

    // Lifecycle notifications for the client to notify the server about text
    // contents of documents and to notify which document is currently focused.
    'textDocument/didOpen': [TextDocument]
    // The 'textDocument/didChange' notification should be sent on almost every
    // keystroke, whether the text contents changed or the cursor/selection
    // changed.  Leave the `content` property undefined when the document's
    // content is unchanged.
    'textDocument/didChange': [TextDocument]
    // The user focused on a document without changing the document's content.
    // Only the 'uri' property is required, other properties are ignored.
    'textDocument/didFocus': [TextDocument]
    // The user closed the editor tab for the given document.
    // Only the 'uri' property is required, other properties are ignored.
    'textDocument/didClose': [TextDocument]

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
    // Resets the chat transcript and clears any in-progress interactions.
    // This notification should be sent when the user starts a new conversation.
    // The chat transcript grows indefinitely if this notification is never sent.
    'transcript/reset': [null]

    // User requested to cancel this progress bar. Only supported for progress
    // bars with `cancelable: true`.
    'progress/cancel': [{ id: string }]

    // ================
    // Server -> Client
    // ================
    // The server received new messages for the ongoing 'chat/executeRecipe'
    // request. The server should never send this notification outside of a
    // 'chat/executeRecipe' request.
    'chat/updateMessageInProgress': [ChatMessage | null]

    'debug/message': [DebugMessage]

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
    id: string | number
}

interface CompletionItemParams {
    completionID: CompletionItemID
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
    id: CompletionItemID
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
}

export interface ServerInfo {
    name: string
    authenticated: boolean
    codyEnabled: boolean
    codyVersion: string | null
    capabilities?: ServerCapabilities
}
interface ServerCapabilities {}

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
export function newTelemetryEvent<Feature extends string, Action extends string, MetadataKey extends string>(
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

export interface TextDocument {
    // Use TextDocumentWithUri.fromDocument(TextDocument) if you want to parse this `uri` property.
    uri: string
    /** @deprecated use `uri` instead. This property only exists for backwards compatibility during the migration period. */
    filePath?: string
    content?: string
    selection?: Range
}

export interface RecipeInfo {
    id: RecipeID
    title: string // Title Case
}

interface ExecuteRecipeParams {
    id: RecipeID
    humanChatInput: string
    data?: any
}

interface ExecuteCommandParams {
    command: string
    arguments?: any[]
}

interface DebugMessage {
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

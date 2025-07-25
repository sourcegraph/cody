import type {
    AuthCredentials,
    AuthStatus,
    ChatMessage,
    ClientCapabilitiesWithLegacyFields,
    ClientConfiguration,
    CodyClientConfig,
    CodyIDE,
    ContextItem,
    ContextItemSource,
    ProcessingStep,
    PromptMode,
    RangeData,
    RequestMessage,
    ResponseMessage,
    SerializedChatMessage,
} from '@sourcegraph/cody-shared'

import type { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'

import type { TelemetryEventParameters } from '@sourcegraph/telemetry'

import type { McpServer } from '@sourcegraph/cody-shared/src/llm-providers/mcp/types'
import type { Uri } from 'vscode'
import type { View } from '../../webviews/tabs/types'
import type { FixupTaskID } from '../non-stop/FixupTask'
import type { CodyTaskState } from '../non-stop/state'

/**
 * DO NOT USE DIRECTLY - ALWAYS USE a TelemetryRecorder from
 * createWebviewTelemetryRecorder instead in webviews.
 *
 * V2 telemetry RPC parameter type for webviews.
 */
export type WebviewRecordEventParameters = TelemetryEventParameters<
    // 👷 HACK:  We use looser string types instead of the actual SDK at
    // '@sourcegraph/cody-shared/src/telemetry-v2' because this defines a
    // wire protocol where the stricter type-checking is pointless. Do not
    // do this elsewhere!
    { [key: string]: number },
    BillingProduct,
    BillingCategory
>

/**
 * The location of where the webview is displayed.
 */
export type WebviewType = 'sidebar' | 'editor'

/**
 * A message sent from the webview to the extension host.
 */
export type WebviewMessage =
    | { command: 'ready' }
    | { command: 'initialized' }
    | {
          /**
           * DO NOT USE DIRECTLY - ALWAYS USE a TelemetryRecorder from
           * createWebviewTelemetryRecorder instead for webviews.
           *
           * V2 telemetry RPC for the webview.
           */
          command: 'recordEvent'
          // 👷 HACK: WARNING: We use looser string types instead of the actual SDK at
          // '@sourcegraph/cody-shared/src/telemetry-v2' because this defines a
          // wire protocol where the stricter type-checking is pointless. Do not
          // do this elsewhere!
          feature: string
          action: string
          parameters: WebviewRecordEventParameters
      }
    | ({ command: 'submit' } & WebviewSubmitMessage)
    | ({ command: 'regenerateCodeBlock' } & WebviewRegenerateCodeBlockMessage)
    | { command: 'restoreHistory'; chatID: string }
    | { command: 'links'; value: string }
    | { command: 'openURI'; uri: Uri; range?: RangeData | undefined | null }
    | {
          // Open a file from a Sourcegraph URL
          command: 'openRemoteFile'
          uri: Uri
          // Attempt to open the same file locally if we can map
          // the repository to an open workspace.
          tryLocal?: boolean | undefined | null
      }
    | {
          command: 'openFileLink'
          uri: Uri
          range?: RangeData | undefined | null
          source?: ContextItemSource | undefined | null
      }
    | {
          command: 'show-page'
          page: string
      }
    | {
          command: 'command'
          id: string
          arg?: string | undefined | null
          args?: Record<string, any> | undefined | null
      }
    | ({ command: 'edit' } & WebviewEditMessage)
    | { command: 'insert'; text: string }
    | { command: 'newFile'; text: string }
    | {
          command: 'copy'
          eventType: 'Button' | 'Keydown'
          text: string
      }
    | {
          command: 'smartApplySubmit' | 'smartApplyPrefetch'
          id: FixupTaskID
          code: string
          instruction?: string | undefined | null
          fileName?: string | undefined | null
          traceparent?: string | undefined | null
          isPrefetch?: boolean | undefined | null
      }
    | {
          command: 'trace-export'
          // The traceSpan is a JSON-encoded string representing the trace data.
          traceSpanEncodedJson: string
      }
    | {
          command: 'smartApplyAccept'
          id: FixupTaskID
      }
    | {
          command: 'smartApplyReject'
          id: FixupTaskID
      }
    | {
          command: 'auth'
          authKind: 'signin' | 'signout' | 'support' | 'callback' | 'switch' | 'refresh'
          endpoint?: string | undefined | null
          value?: string | undefined | null
      }
    | { command: 'abort' }
    | {
          command: 'attribution-search'
          snippet: string
      }
    | { command: 'rpc/request'; message: RequestMessage }
    | {
          command: 'chatSession'
          action: 'duplicate' | 'new'
          sessionID?: string | undefined | null
      }
    | {
          command: 'log'
          level: 'debug' | 'error'
          filterLabel: string
          message: string
      }
    | { command: 'action/confirmation'; id: string; response: boolean }
    | { command: 'devicePixelRatio'; devicePixelRatio: number }
    | {
          command: 'mcp'
          type: 'addServer' | 'removeServer' | 'updateServer'
          name: string
          disabled?: boolean | undefined | null
          config?: Record<string, any> | undefined | null
          toolName?: string | undefined | null
          toolDisabled?: boolean | undefined | null
      }

export interface SmartApplyResult {
    taskId: FixupTaskID
    taskState: CodyTaskState
}

/**
 * A message sent from the extension host to the webview.
 */
export type ExtensionMessage =
    | {
          type: 'config'
          config: ConfigurationSubsetForWebview
          clientCapabilities: ClientCapabilitiesWithLegacyFields
          authStatus: AuthStatus
          workspaceFolderUris: string[]
          siteHasCodyEnabled?: boolean | null | undefined
      }
    | {
          type: 'clientConfig'
          clientConfig?: CodyClientConfig | null | undefined
      }
    | {
          /** Used by JetBrains and not VS Code. */
          type: 'ui/theme'
          agentIDE: CodyIDE
          cssVariables: CodyIDECssVariables
      }
    | ({ type: 'transcript' } & ExtensionTranscriptMessage)
    | { type: 'view'; view: View }
    | { type: 'rateLimit'; isRateLimited: boolean }
    | { type: 'errors'; errors: string }
    | {
          type: 'clientAction'
          addContextItemsToLastHumanInput?: ContextItem[] | null | undefined
          appendTextToLastPromptEditor?: string | null | undefined
          setLastHumanInputIntent?: ChatMessage['intent'] | null | undefined
          smartApplyResult?: SmartApplyResult | undefined | null
          submitHumanInput?: boolean | undefined | null
          setPromptAsInput?:
              | { text: string; mode?: PromptMode | undefined | null; autoSubmit: boolean }
              | undefined
              | null
          regenerateStatus?:
              | { id: string; status: 'regenerating' | 'done' }
              | { id: string; status: 'error'; error: string }
              | undefined
              | null
          mcpServerChanged?: { name: string; server?: McpServer | undefined | null } | undefined | null
          mcpServerError?: { name: string; error: string } | undefined | null
      }
    | ({ type: 'attribution' } & ExtensionAttributionMessage)
    | { type: 'rpc/response'; message: ResponseMessage }
    | { type: 'action/confirmationRequest'; id: string; step: ProcessingStep }

interface ExtensionAttributionMessage {
    snippet: string
    attribution?:
        | {
              repositoryNames: string[]
              limitHit: boolean
          }
        | undefined
        | null
    error?: string | undefined | null
}

export interface WebviewSubmitMessage extends WebviewContextMessage {
    text: string

    /** An opaque value representing the text editor's state. @see {ChatMessage.editorState} */
    editorState?: unknown | undefined | null
    manuallySelectedIntent?: ChatMessage['intent'] | undefined | null
    traceparent?: string | undefined | null
    steps?: ProcessingStep[] | undefined | null
}

interface WebviewEditMessage extends WebviewContextMessage {
    text: string
    index?: number | undefined | null

    /** An opaque value representing the text editor's state. @see {ChatMessage.editorState} */
    editorState?: unknown | undefined | null
    manuallySelectedIntent?: ChatMessage['intent'] | undefined | null
    steps?: ProcessingStep[] | undefined | null
}

interface WebviewContextMessage {
    contextItems?: ContextItem[] | undefined | null
}

interface WebviewRegenerateCodeBlockMessage {
    id: string
    code: string
    language?: string | undefined | null
    index: number
}

export interface ExtensionTranscriptMessage {
    messages: SerializedChatMessage[]
    isMessageInProgress: boolean
    chatID: string
    tokenUsage?:
        | {
              completionTokens?: number | null | undefined
              promptTokens?: number | null | undefined
              totalTokens?: number | null | undefined
          }
        | null
        | undefined
}

/**
 * The subset of configuration that is visible to the webview.
 */
export interface ConfigurationSubsetForWebview
    extends Pick<
            ClientConfiguration,
            'experimentalNoodle' | 'internalDebugContext' | 'internalDebugTokenUsage'
        >,
        Pick<AuthCredentials, 'serverEndpoint'> {
    smartApply: boolean
    hasEditCapability: boolean
    // Type/location of the current webview.
    webviewType?: WebviewType | undefined | null
    // Whether support running multiple webviews (e.g. sidebar w/ multiple editor panels).
    multipleWebviewsEnabled?: boolean | undefined | null
    endpointHistory?: string[] | undefined | null
    allowEndpointChange: boolean
    experimentalPromptEditorEnabled: boolean
    experimentalAgenticChatEnabled: boolean
    attribution: 'none' | 'permissive' | 'enforced'
}

/**
 * URLs for the Sourcegraph instance and app.
 */
export const CODY_DOC_URL = new URL('https://sourcegraph.com/docs/cody')
export const CODY_DOC_QUICKSTART_URL = new URL('https://sourcegraph.com/docs/cody/quickstart')
export const SG_CHANGELOG_URL = new URL('https://sourcegraph.com/changelog')
export const VSCODE_CHANGELOG_URL = new URL(
    'https://github.com/sourcegraph/cody/blob/main/vscode/CHANGELOG.md'
)
// Community and support
export const DISCORD_URL = new URL('https://discord.gg/s2qDtYGnAE')
export const CODY_FEEDBACK_URL = new URL('https://github.com/sourcegraph/cody/issues/new/choose')
export const CODY_SUPPORT_URL = new URL('https://srcgr.ph/cody-support')
// Account
export const ACCOUNT_USAGE_URL = new URL('https://sourcegraph.com/cody/manage')
export const ACCOUNT_LIMITS_INFO_URL = new URL(
    'https://sourcegraph.com/docs/cody/troubleshooting#autocomplete-rate-limits'
)

// Provide backward compatibility for the old token regex
// Details: https://docs.sourcegraph.com/dev/security/secret_formats
const sourcegraphTokenRegex =
    /(sgp_(?:[a-fA-F0-9]{16}|local)|sgp_)?[a-fA-F0-9]{40}|(sgd|slk|sgs)_[a-fA-F0-9]{64}/

/**
 * Checks if the given text matches the regex for a Sourcegraph access token.
 *
 * @param text - The text to check against the regex.
 * @returns Whether the text matches the Sourcegraph token regex.
 */
export function isSourcegraphToken(text: string): boolean {
    return sourcegraphTokenRegex.test(text)
}

interface CodyIDECssVariables {
    [key: string]: string
}

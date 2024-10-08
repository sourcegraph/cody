import type {
    AuthCredentials,
    AuthStatus,
    ChatMessage,
    ClientCapabilities,
    ClientConfiguration,
    CodyIDE,
    ContextItem,
    ContextItemSource,
    RangeData,
    RequestMessage,
    ResponseMessage,
    SerializedChatMessage,
    UserProductSubscription,
} from '@sourcegraph/cody-shared'

import type { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'

import type { TelemetryEventParameters } from '@sourcegraph/telemetry'

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
    | { command: 'restoreHistory'; chatID: string }
    | { command: 'links'; value: string }
    | { command: 'openURI'; uri: Uri }
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
    | { command: 'command'; id: string; arg?: string | undefined | null }
    | ({ command: 'edit' } & WebviewEditMessage)
    | { command: 'insert'; text: string }
    | { command: 'newFile'; text: string }
    | {
          command: 'copy'
          eventType: 'Button' | 'Keydown'
          text: string
      }
    | {
          command: 'smartApplySubmit'
          id: FixupTaskID
          code: string
          instruction?: string | undefined | null
          fileName?: string | undefined | null
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
          authKind: 'signin' | 'signout' | 'support' | 'callback' | 'simplified-onboarding' | 'switch'
          endpoint?: string | undefined | null
          value?: string | undefined | null
          authMethod?: AuthMethod | undefined | null
      }
    | { command: 'abort' }
    | {
          command: 'simplified-onboarding'
          onboardingKind: 'web-sign-in-token'
      }
    | {
          command: 'attribution-search'
          snippet: string
      }
    | { command: 'rpc/request'; message: RequestMessage }
    | { command: 'chatSession'; action: 'duplicate' | 'new'; sessionID?: string | undefined | null }
    | { command: 'log'; level: 'debug' | 'error'; filterLabel: string; message: string }

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
          config: ConfigurationSubsetForWebview & LocalEnv
          clientCapabilities: ClientCapabilities
          authStatus: AuthStatus
          userProductSubscription?: UserProductSubscription | null | undefined
          configFeatures: {
              chat: boolean
              attribution: boolean
              serverSentModels: boolean
          }
          isDotComUser: boolean
          workspaceFolderUris: string[]
      }
    | {
          /** Used by JetBrains and not VS Code. */
          type: 'ui/theme'
          agentIDE: CodyIDE
          cssVariables: CodyIDECssVariables
      }
    | ({ type: 'transcript' } & ExtensionTranscriptMessage)
    | { type: 'view'; view: View }
    | { type: 'errors'; errors: string }
    | {
          type: 'clientAction'
          addContextItemsToLastHumanInput?: ContextItem[] | null | undefined
          appendTextToLastPromptEditor?: string | null | undefined
          smartApplyResult?: SmartApplyResult | undefined | null
      }
    | ({ type: 'attribution' } & ExtensionAttributionMessage)
    | { type: 'rpc/response'; message: ResponseMessage }

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
    intent?: ChatMessage['intent'] | undefined | null
    intentScores?: { intent: string; score: number }[] | undefined | null
    manuallySelectedIntent?: boolean | undefined | null
}

interface WebviewEditMessage extends WebviewContextMessage {
    text: string
    index?: number | undefined | null

    /** An opaque value representing the text editor's state. @see {ChatMessage.editorState} */
    editorState?: unknown | undefined | null
    intent?: ChatMessage['intent'] | undefined | null
    intentScores?: { intent: string; score: number }[] | undefined | null
    manuallySelectedIntent?: boolean | undefined | null
}

interface WebviewContextMessage {
    contextItems?: ContextItem[] | undefined | null
}

export interface ExtensionTranscriptMessage {
    messages: SerializedChatMessage[]
    isMessageInProgress: boolean
    chatID: string
}

/**
 * The subset of configuration that is visible to the webview.
 */
export interface ConfigurationSubsetForWebview
    extends Pick<ClientConfiguration, 'experimentalNoodle' | 'internalDebugContext'>,
        Pick<AuthCredentials, 'serverEndpoint'> {
    smartApply: boolean
    // Type/location of the current webview.
    webviewType?: WebviewType | undefined | null
    // Whether support running multiple webviews (e.g. sidebar w/ multiple editor panels).
    multipleWebviewsEnabled?: boolean | undefined | null
}

/**
 * URLs for the Sourcegraph instance and app.
 */
export const CODY_DOC_URL = new URL('https://sourcegraph.com/docs/cody')
export const SG_CHANGELOG_URL = new URL('https://sourcegraph.com/changelog')

// Community and support
export const DISCORD_URL = new URL('https://discord.gg/s2qDtYGnAE')
export const CODY_FEEDBACK_URL = new URL('https://github.com/sourcegraph/cody/issues/new/choose')
export const CODY_SUPPORT_URL = new URL('https://srcgr.ph/cody-support')
export const CODY_OLLAMA_DOCS_URL = new URL(
    'https://sourcegraph.com/docs/cody/clients/install-vscode#supported-local-ollama-models-with-cody'
)
// Account
export const ACCOUNT_UPGRADE_URL = new URL('https://sourcegraph.com/cody/subscription')
export const ACCOUNT_USAGE_URL = new URL('https://sourcegraph.com/cody/manage')
export const ACCOUNT_LIMITS_INFO_URL = new URL(
    'https://sourcegraph.com/docs/cody/troubleshooting#autocomplete-rate-limits'
)
// TODO: Update this URL to the correct one when the Cody model waitlist is available
export const CODY_BLOG_URL_o1_WAITLIST = new URL('https://sourcegraph.com/blog/openai-o1-for-cody')

/** The local environment of the editor. */
export interface LocalEnv {
    /** Whether the extension is running in VS Code Web (as opposed to VS Code Desktop). */
    uiKindIsWeb: boolean
}

export type AuthMethod = 'dotcom' | 'github' | 'gitlab' | 'google'

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

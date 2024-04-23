import type { URI } from 'vscode-uri'

import type {
    AuthStatus,
    ConfigurationWithAccessToken,
    ContextItem,
    EnhancedContextContextT,
    ModelProvider,
    RangeData,
    SearchPanelFile,
    SerializedChatMessage,
    TelemetryEventProperties,
    UserLocalHistory,
} from '@sourcegraph/cody-shared'

import type { BillingCategory, BillingProduct } from '@sourcegraph/cody-shared/src/telemetry-v2'

import type { TelemetryEventParameters } from '@sourcegraph/telemetry'

import type { View } from '../../webviews/NavBar'
import type { Repo } from '../context/repo-fetcher'

/**
 * DO NOT USE DIRECTLY - ALWAYS USE a TelemetryRecorder from
 * createWebviewTelemetryRecorder instead in webviews..
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
 * A message sent from the webview to the extension host.
 */
export type WebviewMessage =
    | { command: 'ready' }
    | { command: 'initialized' }
    | {
          /**
             * @deprecated v1 telemetry RPC - use 'recordEvent' instead
             */
          command: 'event'
          eventName: string
          properties: TelemetryEventProperties | undefined
      }
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
    | { command: 'history'; action: 'clear' | 'export' }
    | { command: 'restoreHistory'; chatID: string }
    | { command: 'deleteHistory'; chatID: string }
    | { command: 'links'; value: string }
    | {
          command: 'show-page'
          page: string
      }
    | { command: 'chatModel'; model: string }
    | { command: 'get-chat-models' }
    | {
          command: 'openFile'
          uri: URI
          range?: RangeData
      }
    | {
          command: 'openLocalFileWithRange'
          filePath: string
          // Note: we're not using vscode.Range objects or nesting here, as the protocol
          // tends to munge the type in a weird way (nested fields become array indices).
          range?: RangeData
      }
    | ({ command: 'edit' } & WebviewEditMessage)
    | { command: 'context/get-remote-search-repos' }
    | { command: 'context/choose-remote-search-repo'; explicitRepos?: Repo[] }
    | { command: 'context/remove-remote-search-repo'; repoId: string }
    | { command: 'embeddings/index' }
    | { command: 'symf/index' }
    | { command: 'insert'; text: string }
    | { command: 'newFile'; text: string }
    | {
          command: 'copy'
          eventType: 'Button' | 'Keydown'
          text: string
      }
    | {
          command: 'auth'
          authKind: 'signin' | 'signout' | 'support' | 'callback' | 'simplified-onboarding'
          endpoint?: string
          value?: string
          authMethod?: AuthMethod
      }
    | { command: 'abort' }
    | { command: 'reload' }
    | {
          command: 'simplified-onboarding'
          onboardingKind: 'web-sign-in-token'
      }
    | { command: 'getUserContext'; query: string }
    | { command: 'search'; query: string }
    | {
          command: 'show-search-result'
          uri: URI
          range: RangeData
      }
    | {
          command: 'reset'
      }
    | {
          command: 'attribution-search'
          snippet: string
      }

/**
 * A message sent from the extension host to the webview.
 */
export type ExtensionMessage =
    | {
          type: 'config'
          config: ConfigurationSubsetForWebview & LocalEnv
          authStatus: AuthStatus
          workspaceFolderUris: string[]
      }
    | {
          type: 'search:config'
          workspaceFolderUris: string[]
      }
    | { type: 'history'; localHistory: UserLocalHistory | null }
    | ({ type: 'transcript' } & ExtensionTranscriptMessage)
    | { type: 'view'; view: View }
    | { type: 'errors'; errors: string }
    | { type: 'notice'; notice: { key: string } }
    | { type: 'transcript-errors'; isTranscriptError: boolean }
    /**
     * Context files returned from a @-mention search
     */
    | {
          type: 'userContextFiles'
          userContextFiles: ContextItem[] | null
      }
    /**
     * Send Context Files to chat view as input context (@-mentions)
     */
    | { type: 'chat-input-context'; items: ContextItem[] }
    | { type: 'chatModels'; models: ModelProvider[] }
    | {
          type: 'update-search-results'
          results: SearchPanelFile[]
          query: string
      }
    | { type: 'index-updated'; scopeDir: string }
    | { type: 'enhanced-context'; enhancedContextStatus: EnhancedContextContextT }
    | ({ type: 'attribution' } & ExtensionAttributionMessage)
    | { type: 'setChatEnabledConfigFeature'; data: boolean }
    | { type: 'webview-state'; isActive: boolean }
    | { type: 'context/remote-repos'; repos: Repo[] }
    | {
          type: 'setConfigFeatures'
          configFeatures: {
              chat: boolean
              attribution: boolean
          }
      }

interface ExtensionAttributionMessage {
    snippet: string
    attribution?: {
        repositoryNames: string[]
        limitHit: boolean
    }
    error?: string
}

export type ChatSubmitType = 'user' | 'user-newchat'

export interface WebviewSubmitMessage extends WebviewContextMessage {
    text: string
    submitType: ChatSubmitType

    /** An opaque value representing the text editor's state. @see {ChatMessage.editorState} */
    editorState?: unknown
}

interface WebviewEditMessage extends WebviewContextMessage {
    text: string
    index?: number

    /** An opaque value representing the text editor's state. @see {ChatMessage.editorState} */
    editorState?: unknown
}

interface WebviewContextMessage {
    addEnhancedContext?: boolean
    contextFiles?: ContextItem[]
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
    extends Pick<
        ConfigurationWithAccessToken,
        'debugEnable' | 'experimentalGuardrails' | 'serverEndpoint'
    > {}

/**
 * URLs for the Sourcegraph instance and app.
 */
export const CODY_DOC_URL = new URL('https://sourcegraph.com/docs/cody')

// Community and support
export const DISCORD_URL = new URL('https://discord.gg/s2qDtYGnAE')
export const CODY_FEEDBACK_URL = new URL('https://github.com/sourcegraph/cody/issues/new/choose')
export const CODY_SUPPORT_URL = new URL('https://srcgr.ph/cody-support')
// Account
export const ACCOUNT_UPGRADE_URL = new URL('https://sourcegraph.com/cody/subscription')
export const ACCOUNT_USAGE_URL = new URL('https://sourcegraph.com/cody/manage')
export const ACCOUNT_LIMITS_INFO_URL = new URL(
    'https://sourcegraph.com/docs/cody/troubleshooting#autocomplete-rate-limits'
)

export const defaultAuthStatus = {
    endpoint: '',
    isDotCom: true,
    isLoggedIn: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies AuthStatus

export const unauthenticatedStatus = {
    endpoint: '',
    isDotCom: true,
    isLoggedIn: false,
    showInvalidAccessTokenError: true,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies AuthStatus

export const networkErrorAuthStatus = {
    isDotCom: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    isLoggedIn: false,
    hasVerifiedEmail: false,
    showNetworkError: true,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
    userCanUpgrade: false,
    username: '',
    primaryEmail: '',
    displayName: '',
    avatarURL: '',
    codyApiVersion: 0,
} satisfies Omit<AuthStatus, 'endpoint'>

/** The local environment of the editor. */
export interface LocalEnv {
    /** Whether the extension is running in VS Code Web (as opposed to VS Code Desktop). */
    uiKindIsWeb: boolean
}

export function isLoggedIn(authStatus: AuthStatus): boolean {
    if (!authStatus.siteHasCodyEnabled) {
        return false
    }
    return (
        authStatus.authenticated &&
        (authStatus.requiresVerifiedEmail ? authStatus.hasVerifiedEmail : true)
    )
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

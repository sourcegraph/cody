import type { URI } from 'vscode-uri'

import type {
    ChatMessage,
    CodyLLMSiteConfiguration,
    ConfigurationWithAccessToken,
    ContextItem,
    EnhancedContextContextT,
    ModelProvider,
    RangeData,
    SearchPanelFile,
    TelemetryEventProperties,
    UserLocalHistory,
} from '@sourcegraph/cody-shared'
import type { CodeBlockMeta } from '../../webviews/chat/CodeBlocks'

import type { View } from '../../webviews/NavBar'
import type { Repo } from '../context/repo-fetcher'

/**
 * A message sent from the webview to the extension host.
 */
export type WebviewMessage =
    | { command: 'ready' }
    | { command: 'initialized' }
    | {
          command: 'event'
          eventName: string
          properties: TelemetryEventProperties | undefined
      } // new event log internal API (use createWebviewTelemetryService wrapper)
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
    | { command: 'insert'; text: string; metadata?: CodeBlockMeta }
    | { command: 'newFile'; text: string; metadata?: CodeBlockMeta }
    | {
          command: 'copy'
          eventType: 'Button' | 'Keydown'
          text: string
          metadata?: CodeBlockMeta
      }
    | {
          command: 'auth'
          authKind:
              | 'signin'
              | 'signout'
              | 'support'
              | 'callback'
              | 'simplified-onboarding'
              | 'simplified-onboarding-exposure'
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
    | {
          type: 'userContextFiles'
          userContextFiles: ContextItem[] | null
      }
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
}

interface WebviewEditMessage extends WebviewContextMessage {
    text: string
    index?: number
}

interface WebviewContextMessage {
    addEnhancedContext?: boolean
    contextFiles?: ContextItem[]
}

export interface ExtensionTranscriptMessage {
    messages: ChatMessage[]
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
// Account
export const ACCOUNT_UPGRADE_URL = new URL('https://sourcegraph.com/cody/subscription')
export const ACCOUNT_USAGE_URL = new URL('https://sourcegraph.com/cody/manage')
export const ACCOUNT_LIMITS_INFO_URL = new URL(
    'https://sourcegraph.com/docs/cody/troubleshooting#autocomplete-rate-limits'
)

/**
 * The status of a users authentication, whether they're authenticated and have a
 * verified email.
 */
export interface AuthStatus {
    username: string
    endpoint: string | null
    isDotCom: boolean
    isLoggedIn: boolean
    showInvalidAccessTokenError: boolean
    authenticated: boolean
    hasVerifiedEmail: boolean
    requiresVerifiedEmail: boolean
    siteHasCodyEnabled: boolean
    siteVersion: string
    configOverwrites?: CodyLLMSiteConfiguration
    showNetworkError?: boolean
    primaryEmail: string
    displayName?: string
    avatarURL: string
    /**
     * Whether the users account can be upgraded.
     *
     * This is `true` if the user is on dotCom and has
     * not already upgraded. It is used to customise
     * rate limit messages and show additional upgrade
     * buttons in the UI.
     */
    userCanUpgrade: boolean
}

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
} satisfies Omit<AuthStatus, 'endpoint'>

/** The local environment of the editor. */
export interface LocalEnv {
    // The  operating system kind
    os: string
    arch: string
    homeDir?: string | undefined

    extensionVersion: string

    // Whether the extension is running in VS Code Web (as opposed to VS Code Desktop).
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

import { CodyPrompt, CustomCommandType } from '@sourcegraph/cody-shared/src/chat/commands'
import { ChatContextStatus } from '@sourcegraph/cody-shared/src/chat/context'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatMessage, UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { Configuration } from '@sourcegraph/cody-shared/src/configuration'
import { CodyLLMSiteConfiguration } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import type { TelemetryEventProperties } from '@sourcegraph/cody-shared/src/telemetry'

import { View } from '../../webviews/NavBar'

/**
 * A message sent from the webview to the extension host.
 */
export type WebviewMessage =
    | { command: 'ready' }
    | { command: 'initialized' }
    | { command: 'event'; eventName: string; properties: TelemetryEventProperties | undefined } // new event log internal API (use createWebviewTelemetryService wrapper)
    | { command: 'submit'; text: string; submitType: 'user' | 'suggestion' | 'example' }
    | { command: 'executeRecipe'; recipe: RecipeID }
    | { command: 'history'; action: 'clear' | 'export' }
    | { command: 'restoreHistory'; chatID: string }
    | { command: 'deleteHistory'; chatID: string }
    | { command: 'links'; value: string }
    | { command: 'openFile'; filePath: string }
    | {
          command: 'openLocalFileWithRange'
          filePath: string
          // Note: we're not using vscode.Range objects or nesting here, as the protocol
          // tends ot munge the type in a weird way (nested fields become array indices).
          range?: { startLine: number; startCharacter: number; endLine: number; endCharacter: number }
      }
    | { command: 'edit'; text: string }
    | { command: 'insert'; text: string }
    | { command: 'newFile'; text: string }
    | { command: 'copy'; eventType: 'Button' | 'Keydown'; text: string; commandName?: string }
    | {
          command: 'auth'
          type:
              | 'signin'
              | 'signout'
              | 'support'
              | 'app'
              | 'callback'
              | 'simplified-onboarding'
              | 'simplified-onboarding-exposure'
          endpoint?: string
          value?: string
          authMethod?: AuthMethod
      }
    | { command: 'abort' }
    | { command: 'custom-prompt'; title: string; value?: CustomCommandType }
    | { command: 'reload' }
    | {
          command: 'simplified-onboarding'
          type: 'install-app' | 'open-app' | 'reload-state'
      }

/**
 * A message sent from the extension host to the webview.
 */
export type ExtensionMessage =
    | { type: 'config'; config: ConfigurationSubsetForWebview & LocalEnv; authStatus: AuthStatus }
    | { type: 'login'; authStatus: AuthStatus }
    | { type: 'history'; messages: UserLocalHistory | null }
    | { type: 'transcript'; messages: ChatMessage[]; isMessageInProgress: boolean }
    | { type: 'contextStatus'; contextStatus: ChatContextStatus }
    | { type: 'view'; messages: View }
    | { type: 'errors'; errors: string }
    | { type: 'suggestions'; suggestions: string[] }
    | { type: 'app-state'; isInstalled: boolean }
    | { type: 'notice'; notice: { key: string } }
    | { type: 'custom-prompts'; prompts: [string, CodyPrompt][] }
    | { type: 'transcript-errors'; isTranscriptError: boolean }

/**
 * The subset of configuration that is visible to the webview.
 */
export interface ConfigurationSubsetForWebview
    extends Pick<Configuration, 'debugEnable' | 'serverEndpoint'>,
        Experiments {}

/**
 * URLs for the Sourcegraph instance and app.
 */
export const DOTCOM_CALLBACK_URL = new URL('https://sourcegraph.com/user/settings/tokens/new/callback')
export const CODY_DOC_URL = new URL('https://docs.sourcegraph.com/cody')

// Community and support
export const DISCORD_URL = new URL('https://discord.gg/s2qDtYGnAE')
export const CODY_FEEDBACK_URL = new URL(
    'https://github.com/sourcegraph/cody/discussions/new?category=product-feedback&labels=vscode'
)
// APP
export const APP_LANDING_URL = new URL('https://about.sourcegraph.com/app')
export const APP_CALLBACK_URL = new URL('sourcegraph://user/settings/tokens/new/callback')
export const APP_REPOSITORIES_URL = new URL('sourcegraph://users/admin/app-settings/local-repositories')

/**
 * The status of a users authentication, whether they're authenticated and have a
 * verified email.
 */
export interface AuthStatus {
    username?: string
    endpoint: string | null
    isLoggedIn: boolean
    showInvalidAccessTokenError: boolean
    authenticated: boolean
    hasVerifiedEmail: boolean
    requiresVerifiedEmail: boolean
    siteHasCodyEnabled: boolean
    siteVersion: string
    configOverwrites?: CodyLLMSiteConfiguration
    showNetworkError?: boolean
}

export const defaultAuthStatus = {
    endpoint: '',
    isLoggedIn: false,
    showInvalidAccessTokenError: false,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
}

export const unauthenticatedStatus = {
    endpoint: '',
    isLoggedIn: false,
    showInvalidAccessTokenError: true,
    authenticated: false,
    hasVerifiedEmail: false,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
}

export const networkErrorAuthStatus = {
    showInvalidAccessTokenError: false,
    authenticated: false,
    isLoggedIn: false,
    hasVerifiedEmail: false,
    showNetworkError: true,
    requiresVerifiedEmail: false,
    siteHasCodyEnabled: false,
    siteVersion: '',
}

export interface Experiments {
    experimentOnboarding: OnboardingExperimentArm
}

/** The local environment of the editor. */
export interface LocalEnv {
    // The operating system kind
    os: string
    arch: string
    homeDir?: string | undefined

    // The URL scheme the editor is registered to in the operating system
    uriScheme: string
    // The application name of the editor
    appName: string
    extensionVersion: string

    /** Whether the extension is running in VS Code Web (as opposed to VS Code Desktop). */
    uiKindIsWeb: boolean

    // App Local State
    hasAppJson: boolean
    isAppInstalled: boolean
    isAppRunning: boolean
}

export function isLoggedIn(authStatus: AuthStatus): boolean {
    if (!authStatus.siteHasCodyEnabled) {
        return false
    }
    return authStatus.authenticated && (authStatus.requiresVerifiedEmail ? authStatus.hasVerifiedEmail : true)
}

// The OS and Arch support for Cody app
export function isOsSupportedByApp(os?: string, arch?: string): boolean {
    if (!os || !arch) {
        return false
    }
    return os === 'darwin' || os === 'linux'
}

// Map the Arch to the app's supported Arch
export function archConvertor(arch: string): string {
    switch (arch) {
        case 'arm64':
            return 'aarch64'
        case 'x64':
            return 'x86_64'
    }
    return arch
}

// Simplified Onboarding types which are shared between WebView and extension.

export type AuthMethod = 'dotcom' | 'github' | 'gitlab' | 'google'

export enum OnboardingExperimentArm {
    // Note, these values are persisted to local storage, see pickArm. Do not
    // change these values. Adding values is OK but don't delete them.
    Classic = 0, // Control
    Simplified = 1, // Treatment: simplified onboarding flow

    MinValue = Classic,
    // Update this when adding an arm to the trial.
    MaxValue = Simplified,
}

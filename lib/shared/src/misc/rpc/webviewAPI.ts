import { Observable } from 'observable-fns'
import type {
    AuthCredentials,
    AuthStatus,
    ClientCapabilitiesWithLegacyFields,
    ClientConfiguration,
    ModelsData,
    ResolvedConfiguration,
    SerializedPromptEditorState,
    UserProductSubscription,
} from '../..'
import type { ChatMessage, UserLocalHistory } from '../../chat/transcript/messages'
import type { ContextItem } from '../../codebase-context/messages'
import type { CodyCommand } from '../../commands/types'
import type { FeatureFlag } from '../../experimentation/FeatureFlagProvider'
import type { ContextMentionProviderMetadata } from '../../mentions/api'
import type { MentionQuery } from '../../mentions/query'
import type { Model } from '../../models/model'
import type { FetchHighlightFileParameters, Prompt } from '../../sourcegraph-api/graphql/client'
import { type createMessageAPIForWebview, proxyExtensionAPI } from './rpc'

export interface WebviewToExtensionAPI {
    /**
     * The configuration for the webview. Called `legacyConfig` because it is currently using the
     * custom {@link LegacyWebviewConfig} type and not the new global singletons like
     * {@link resolvedConfig} and {@link authStatus}.
     */
    legacyConfig(): Observable<LegacyWebviewConfig>

    /**
     * Get the data to display in the @-mention menu for the given query.
     */
    mentionMenuData(query: MentionQuery): Observable<MentionMenuData>

    /**
     * Get the evaluated value of a feature flag.
     */
    evaluatedFeatureFlag(flag: FeatureFlag): Observable<boolean | undefined>

    /**
     * Observe the results of querying prompts in the Prompt Library. For backcompat, it also
     * includes matching builtin commands and custom commands (which are both deprecated in favor of
     * the Prompt Library).
     */
    prompts(query: string): Observable<PromptsResult>

    /**
     * The models data, including all available models, site defaults, and user preferences.
     */
    models(): Observable<ModelsData | null>

    /**
     * Observe the list of available chat models.
     */
    chatModels(): Observable<Model[]>

    highlights(query: FetchHighlightFileParameters): Observable<string[][]>

    hydratePromptMessage(
        promptText: string,
        initialContext?: ContextItem[]
    ): Observable<SerializedPromptEditorState>

    /**
     * Set the chat model.
     */
    setChatModel(model: Model['id']): Observable<void>

    /**
     * Observe the initial context that should be populated in the chat message input field.
     */
    initialContext(): Observable<ContextItem[]>

    detectIntent(
        text: string
    ): Observable<
        { intent: ChatMessage['intent']; allScores: { intent: string; score: number }[] } | undefined
    >

    /**
     * Observe the current resolved configuration (same as the global {@link resolvedConfig}
     * observable).
     */
    resolvedConfig(): Observable<ResolvedConfiguration>

    /**
     * Observe the current auth status (same as the global {@link authStatus} observable).
     */
    authStatus(): Observable<AuthStatus>

    /**
     * Observe the current transcript.
     */
    transcript(): Observable<readonly ChatMessage[]>

    /**
     * The current user's chat history.
     */
    userHistory(): Observable<UserLocalHistory | null>

    /**
     * The current user's product subscription information (Cody Free/Pro).
     */
    userProductSubscription(): Observable<UserProductSubscription | null>
}

export function createExtensionAPI(
    messageAPI: ReturnType<typeof createMessageAPIForWebview>,

    // As a workaround for Cody Web, support providing static initial context.
    staticInitialContext?: ContextItem[]
): WebviewToExtensionAPI {
    const hydratePromptMessage = proxyExtensionAPI(messageAPI, 'hydratePromptMessage')
    return {
        legacyConfig: proxyExtensionAPI(messageAPI, 'legacyConfig'),
        mentionMenuData: proxyExtensionAPI(messageAPI, 'mentionMenuData'),
        evaluatedFeatureFlag: proxyExtensionAPI(messageAPI, 'evaluatedFeatureFlag'),
        prompts: proxyExtensionAPI(messageAPI, 'prompts'),
        models: proxyExtensionAPI(messageAPI, 'models'),
        chatModels: proxyExtensionAPI(messageAPI, 'chatModels'),
        highlights: proxyExtensionAPI(messageAPI, 'highlights'),
        hydratePromptMessage: promptText => hydratePromptMessage(promptText, staticInitialContext),
        setChatModel: proxyExtensionAPI(messageAPI, 'setChatModel'),
        initialContext: staticInitialContext
            ? () => Observable.of(staticInitialContext)
            : proxyExtensionAPI(messageAPI, 'initialContext'),
        detectIntent: proxyExtensionAPI(messageAPI, 'detectIntent'),
        resolvedConfig: proxyExtensionAPI(messageAPI, 'resolvedConfig'),
        authStatus: proxyExtensionAPI(messageAPI, 'authStatus'),
        transcript: proxyExtensionAPI(messageAPI, 'transcript'),
        userHistory: proxyExtensionAPI(messageAPI, 'userHistory'),
        userProductSubscription: proxyExtensionAPI(messageAPI, 'userProductSubscription'),
    }
}

export interface MentionMenuData {
    providers: ContextMentionProviderMetadata[]
    items: (ContextItem & { icon?: string })[] | undefined

    /**
     * If an error is present, the client should display the error *and* still display the other
     * data that is present.
     */
    error?: string
}

export interface PromptAction extends Prompt {
    actionType: 'prompt'
}

export interface CommandAction extends CodyCommand {
    actionType: 'command'
}

export type Action = PromptAction | CommandAction

export interface PromptsResult {
    arePromptsSupported: boolean

    /** List of all available actions (prompts and/or commands) */
    actions: Action[]

    /** The original query used to fetch this result. */
    query: string
}

/**
 * The 'config' message from {@link ExtensionMessage}, which is now being via the new
 * Observable-based webview API. Called "legacy" because we will refactor this to use the global
 * singletons {@link resolvedConfig} and {@link authStatus} in the future.
 */
export interface LegacyWebviewConfig {
    config: ConfigurationSubsetForWebview & LocalEnv
    clientCapabilities: ClientCapabilitiesWithLegacyFields
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

/** The local environment of the editor. */
export interface LocalEnv {
    /** Whether the extension is running in VS Code Web (as opposed to VS Code Desktop). */
    uiKindIsWeb: boolean
}

/**
 * The location of where the webview is displayed.
 */
export type WebviewType = 'sidebar' | 'editor'

/**
 * The subset of configuration that is visible to the webview.
 */
export interface ConfigurationSubsetForWebview
    extends Pick<
            ClientConfiguration,
            'experimentalNoodle' | 'agentIDE' | 'agentExtensionVersion' | 'internalDebugContext'
        >,
        Pick<AuthCredentials, 'serverEndpoint'> {
    smartApply: boolean
    // Type/location of the current webview.
    webviewType?: WebviewType | undefined | null
    // Whether support running multiple webviews (e.g. sidebar w/ multiple editor panels).
    multipleWebviewsEnabled?: boolean | undefined | null
}

import { Observable } from 'observable-fns'
import type { AuthStatus, ResolvedConfiguration } from '../..'
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
     * Observe the list of available models.
     */
    models(): Observable<Model[]>

    highlights(query: FetchHighlightFileParameters): Observable<string[][]>

    /**
     * Set the chat model.
     */
    setChatModel(model: Model['id']): Observable<void>

    /**
     * Observe the initial context that should be populated in the chat message input field.
     */
    initialContext(): Observable<ContextItem[]>

    detectIntent(text: string): Observable<ChatMessage['intent']>

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
}

export function createExtensionAPI(
    messageAPI: ReturnType<typeof createMessageAPIForWebview>,

    // As a workaround for Cody Web, support providing static initial context.
    staticInitialContext?: ContextItem[]
): WebviewToExtensionAPI {
    return {
        mentionMenuData: proxyExtensionAPI(messageAPI, 'mentionMenuData'),
        evaluatedFeatureFlag: proxyExtensionAPI(messageAPI, 'evaluatedFeatureFlag'),
        prompts: proxyExtensionAPI(messageAPI, 'prompts'),
        models: proxyExtensionAPI(messageAPI, 'models'),
        highlights: proxyExtensionAPI(messageAPI, 'highlights'),
        setChatModel: proxyExtensionAPI(messageAPI, 'setChatModel'),
        initialContext: staticInitialContext
            ? () => Observable.of(staticInitialContext)
            : proxyExtensionAPI(messageAPI, 'initialContext'),
        detectIntent: proxyExtensionAPI(messageAPI, 'detectIntent'),
        resolvedConfig: proxyExtensionAPI(messageAPI, 'resolvedConfig'),
        authStatus: proxyExtensionAPI(messageAPI, 'authStatus'),
        transcript: proxyExtensionAPI(messageAPI, 'transcript'),
        userHistory: proxyExtensionAPI(messageAPI, 'userHistory'),
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

export interface PromptsResult {
    /**
     * `undefined` means the Sourcegraph endpoint is an older Sourcegraph version that doesn't
     * support the Prompt Library.
     */
    prompts:
        | { type: 'results'; results: Prompt[] }
        | { type: 'error'; error: string }
        | { type: 'unsupported' }

    /**
     * Provides previously built-in commands which became prompt-like actions (explain code,
     * generate unit tests, document symbol, etc.) Currently, is used behind feature flag.
     */
    standardPrompts?: CodyCommand[]

    /**
     * `undefined` means that commands should not be shown at all (not even as an empty
     * list). Builtin and custom commands are deprecated in favor of the Prompt Library.
     */
    commands: CodyCommand[]

    /** The original query used to fetch this result. */
    query: string
}

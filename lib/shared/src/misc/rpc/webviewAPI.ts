import type { Observable } from 'observable-fns'
import type { ChatMessage } from '../../chat/transcript/messages'
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
     * Get the evaluated value of a feature flag. All feature flags used by the webview must be in
     * {@link FEATURE_FLAGS_USED_IN_WEBVIEW}.
     */
    evaluatedFeatureFlag(flag: FeatureFlagUsedInWebview): Observable<boolean | undefined>

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

    detectIntent(text: string): Observable<ChatMessage['intent']>
}

export function createExtensionAPI(
    messageAPI: ReturnType<typeof createMessageAPIForWebview>
): WebviewToExtensionAPI {
    return {
        mentionMenuData: proxyExtensionAPI(messageAPI, 'mentionMenuData'),
        evaluatedFeatureFlag: proxyExtensionAPI(messageAPI, 'evaluatedFeatureFlag'),
        prompts: proxyExtensionAPI(messageAPI, 'prompts'),
        models: proxyExtensionAPI(messageAPI, 'models'),
        highlights: proxyExtensionAPI(messageAPI, 'highlights'),
        setChatModel: proxyExtensionAPI(messageAPI, 'setChatModel'),
        detectIntent: proxyExtensionAPI(messageAPI, 'detectIntent'),
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
     * `undefined` means that commands should not be shown at all (not even as an empty
     * list). Builtin and custom commands are deprecated in favor of the Prompt Library.
     */
    commands: CodyCommand[]

    /** The original query used to fetch this result. */
    query: string
}

/**
 * You must add a feature flag here if you need to use it from the frontend. This is because only
 * explicitly requested feature flags are evaluated immediately. If you don't add one here, its old
 * value will be cached on the server and returned until it is explicitly evaluated.
 */
const FEATURE_FLAGS_USED_IN_WEBVIEW = [] as const satisfies FeatureFlag[]
export type FeatureFlagUsedInWebview = (typeof FEATURE_FLAGS_USED_IN_WEBVIEW)[number]

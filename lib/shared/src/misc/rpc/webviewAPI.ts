import type { ContextItem } from '../../codebase-context/messages'
import { FeatureFlag } from '../../experimentation/FeatureFlagProvider'
import type { ContextMentionProviderMetadata } from '../../mentions/api'
import type { MentionQuery } from '../../mentions/query'
import type { Prompt } from '../../sourcegraph-api/graphql/client'

export interface WebviewToExtensionAPI {
    mentionProviders(signal: AbortSignal): AsyncGenerator<ContextMentionProviderMetadata[]>
    contextItems(query: MentionQuery, signal: AbortSignal): AsyncGenerator<ContextItem[]>

    /**
     * Get the evaluated value of a feature flag. All feature flags used by the webview must be in
     * {@link FEATURE_FLAGS_USED_IN_WEBVIEW}.
     */
    evaluatedFeatureFlag(
        flag: FeatureFlagUsedInWebview,
        signal: AbortSignal
    ): AsyncGenerator<boolean | undefined>

    prompts(query: string, signal: AbortSignal): AsyncGenerator<Prompt[]>
}

/**
 * You must add a feature flag here if you need to use it from the frontend. This is because only
 * explicitly requested feature flags are evaluated immediately. If you don't add one here, its old
 * value will be cached on the server and returned until it is explicitly evaluated.
 */
const FEATURE_FLAGS_USED_IN_WEBVIEW = [FeatureFlag.ChatPromptSelector] as const satisfies FeatureFlag[]
export type FeatureFlagUsedInWebview = (typeof FEATURE_FLAGS_USED_IN_WEBVIEW)[number]

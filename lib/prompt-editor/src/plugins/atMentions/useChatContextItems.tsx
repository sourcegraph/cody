import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    type MentionQuery,
    memoizeLastValue,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { createContext, useCallback, useContext, useMemo } from 'react'
import { type UseAsyncGeneratorResult, useAsyncGenerator } from '../../useAsyncGenerator'
import { useExtensionAPI } from '../../useExtensionAPI'

export interface ChatMentionsSettings {
    resolutionMode: 'remote' | 'local'
}

export const ChatMentionContext = createContext<ChatMentionsSettings>({
    resolutionMode: 'local',
})

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(
    query: string | null,
    provider: ContextMentionProviderMetadata | null
): UseAsyncGeneratorResult<ContextItem[]> {
    const mentionSettings = useContext(ChatMentionContext)
    const unmemoizedCallContextItems = useExtensionAPI().contextItems

    const callContextItems = useMemo(
        () =>
            mentionSettings.resolutionMode === 'local'
                ? memoizeLastValue(unmemoizedCallContextItems, ([query]) => JSON.stringify(query))
                : unmemoizedCallContextItems,
        [unmemoizedCallContextItems, mentionSettings]
    )

    const mentionQuery: MentionQuery = useMemo(
        () => ({
            ...parseMentionQuery(query ?? '', provider),
            includeRemoteRepositories: mentionSettings.resolutionMode === 'remote',
        }),
        [query, provider, mentionSettings]
    )

    return useAsyncGenerator(
        useCallback(signal => callContextItems(mentionQuery, signal), [callContextItems, mentionQuery]),
        { preserveValueKey: mentionQuery.provider ?? undefined }
    )
}

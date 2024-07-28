import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

export interface ChatMentionsSettings {
    resolutionMode: 'remote' | 'local'
}

export const ChatMentionContext = createContext<ChatMentionsSettings>({
    resolutionMode: 'local',
})

export interface ChatContextClient {
    getChatContextItems(params: { query: MentionQuery }): Promise<{
        userContextFiles?: ContextItem[] | null | undefined
    }>
    getMentionProvidersMetadata(
        params: Record<string, never>
    ): Promise<{ providers: ContextMentionProviderMetadata[] }>
}

const ChatContextClientContext = createContext<ChatContextClient | undefined>(undefined)

export const ChatContextClientProvider = ChatContextClientContext.Provider

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(
    query: string | null,
    provider: ContextMentionProviderMetadata | null
): ContextItem[] | undefined {
    const mentionSettings = useContext(ChatMentionContext)
    const unmemoizedClient = useContext(ChatContextClientContext)
    if (!unmemoizedClient) {
        throw new Error('useChatContextItems must be used within a ChatContextClientProvider')
    }

    const chatContextClient = useMemo(
        () =>
            mentionSettings.resolutionMode === 'local'
                ? memoizeChatContextClient(unmemoizedClient)
                : unmemoizedClient,
        [unmemoizedClient, mentionSettings]
    )
    const [results, setResults] = useState<ContextItem[]>()
    const lastProvider = useRef<ContextMentionProviderMetadata['id'] | null>(null)

    const hasResults = useRef(false)
    hasResults.current = Boolean(results && results.length > 0)

    useEffect(() => {
        // An empty query is a valid query that we use to get open tabs context, while a null query
        // means this is not an at-mention query.
        if (query === null) {
            setResults(undefined)
            return
        }

        // If user has typed an incomplete range, fetch new chat context items only if there are no
        // results.
        const mentionQuery: MentionQuery = {
            ...parseMentionQuery(query, provider),
            includeRemoteRepositories: mentionSettings.resolutionMode === 'remote',
        }

        if (!hasResults && mentionQuery.maybeHasRangeSuffix && !mentionQuery.range) {
            return
        }

        // Invalidate results if the provider has changed because the results are certainly stale.
        if (mentionQuery.provider !== (lastProvider.current ?? FILE_CONTEXT_MENTION_PROVIDER.id)) {
            setResults(undefined)
        }
        lastProvider.current = mentionQuery.provider

        // Track if the query changed since this request was sent (which would make our results
        // no longer valid).
        let invalidated = false

        if (chatContextClient) {
            chatContextClient
                .getChatContextItems({ query: mentionQuery })
                .then(result => {
                    // Since remote mention search debounce and batches all mention
                    // search requests we shouldn't invalidate any old responses like
                    // we do for local search.
                    if (invalidated && !mentionQuery.includeRemoteRepositories) {
                        return
                    }
                    setResults(result.userContextFiles ?? [])
                })
                .catch(error => {
                    setResults(undefined)
                    console.error(error)
                })
        }

        return () => {
            invalidated = true
        }
    }, [query, provider, chatContextClient, mentionSettings])
    return results
}

function memoizeChatContextClient(
    client: ChatContextClient
): Pick<ChatContextClient, 'getChatContextItems'> {
    const cache = new LRUCache<
        string,
        {
            userContextFiles?: ContextItem[] | null | undefined
        }
    >({ max: 10 })
    return {
        async getChatContextItems(params) {
            const key = JSON.stringify(params)
            const cached = cache.get(key)
            if (cached !== undefined) {
                return cached
            }

            const result = await client.getChatContextItems(params)
            cache.set(key, result)
            return result
        },
    }
}

const EMPTY_PROVIDERS: ContextMentionProviderMetadata[] = []

export function useChatContextMentionProviders(): {
    providers: ContextMentionProviderMetadata[]
    reload: () => void
} {
    const client = useContext(ChatContextClientContext)
    const [providers, setProviders] = useState<ContextMentionProviderMetadata[]>()

    const load = useCallback(() => {
        if (client) {
            client
                .getMentionProvidersMetadata({})
                .then(result => setProviders(result.providers))
                .catch(error => {
                    console.error(error)
                    setProviders(EMPTY_PROVIDERS)
                })
        }
    }, [client])
    useEffect(() => {
        load()
    }, [load])

    return useMemo(() => ({ providers: providers ?? EMPTY_PROVIDERS, reload: load }), [providers, load])
}

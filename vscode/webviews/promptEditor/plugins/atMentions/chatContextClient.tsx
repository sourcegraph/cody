import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    type ExtHostAPI,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useExtHostClient } from '../../../utils/extHostClient'

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(
    query: string | null,
    provider: ContextMentionProviderMetadata | null
): ContextItem[] | undefined {
    const { queryContextItems } = useExtHostClient()
    const memoizedQueryContextItems = useMemo(
        () => memoizeQueryContextItems(queryContextItems),
        [queryContextItems]
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
        const mentionQuery = parseMentionQuery(query, provider)
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

        if (memoizedQueryContextItems) {
            memoizedQueryContextItems(mentionQuery)
                .then(mentions => {
                    if (invalidated) {
                        return
                    }
                    setResults(mentions ?? [])
                })
                .catch(error => {
                    setResults(undefined)
                    console.error(error)
                })
        }

        return () => {
            invalidated = true
        }
    }, [query, provider, memoizedQueryContextItems])
    return results
}

function memoizeQueryContextItems(
    queryContextItems: ExtHostAPI['queryContextItems']
): ExtHostAPI['queryContextItems'] {
    const cache = new LRUCache<string, ContextItem[]>({ max: 10 })
    return async (query: MentionQuery): Promise<ContextItem[]> => {
        const key = JSON.stringify(query)
        const cached = cache.get(key)
        if (cached !== undefined) {
            return cached
        }

        const result = (await queryContextItems(query)) ?? []
        cache.set(key, result)
        return result
    }
}

import {
    type Client,
    type ContextItem,
    type ContextMentionProviderMetadata,
    type ExtHostAPI,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionQuery,
    createConnectionFromWebviewToExtHost,
    hydrateAfterPostMessage,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import {
    type FunctionComponent,
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { URI } from 'vscode-uri'

export interface ChatContextClient extends Pick<Client<ExtHostAPI>['proxy'], 'queryContextItems'> {}

const extHostClient = createConnectionFromWebviewToExtHost(
    globalThis as any,
    {
        helloWorld() {
            return Promise.resolve('Hello, world! from the webview')
        },
    },
    { hydrate: message => hydrateAfterPostMessage(message, uri => URI.from(uri as any)) }
)

const ChatContextClientContext: React.Context<ChatContextClient> = createContext(extHostClient.proxy)

export const WithChatContextClient: FunctionComponent<
    React.PropsWithChildren<{ value: ChatContextClient }>
> = ({ value, children }) => (
    <ChatContextClientContext.Provider value={value}>{children}</ChatContextClientContext.Provider>
)

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(
    query: string | null,
    provider: ContextMentionProviderMetadata | null
): ContextItem[] | undefined {
    const unmemoizedClient = useContext(ChatContextClientContext)
    const chatContextClient = useMemo(
        () => memoizeChatContextClient(unmemoizedClient),
        [unmemoizedClient]
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

        if (chatContextClient) {
            chatContextClient
                .queryContextItems(mentionQuery)
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
    }, [query, provider, chatContextClient])
    return results
}

function memoizeChatContextClient(client: ChatContextClient): ChatContextClient {
    const cache = new LRUCache<string, ContextItem[]>({ max: 10 })
    return {
        async queryContextItems(query: MentionQuery): Promise<ContextItem[]> {
            const key = JSON.stringify(query)
            const cached = cache.get(key)
            if (cached !== undefined) {
                return cached
            }

            const result = (await client.queryContextItems(query)) ?? []
            cache.set(key, result)
            return result
        },
    }
}

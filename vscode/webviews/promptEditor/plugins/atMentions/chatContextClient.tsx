import {
    type ContextItem,
    type ContextMentionProviderInformation,
    displayPath,
} from '@sourcegraph/cody-shared'
import { type FunctionComponent, createContext, useContext, useEffect, useState } from 'react'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { LINE_RANGE_REGEXP, RANGE_MATCHES_REGEXP, parseLineRangeInMention } from './atMentions'

export interface ChatContextClient {
    getChatContext(
        query: string
    ): Promise<{ items: ContextItem[]; mentionProviders: ContextMentionProviderInformation[] }>
}

const ChatContextClientContext: React.Context<ChatContextClient> = createContext({
    getChatContext(
        query: string
    ): Promise<{ items: ContextItem[]; mentionProviders: ContextMentionProviderInformation[] }> {
        // TODO(sqs): Would be best to handle line ranges on the backend, not here.
        const { textWithoutRange: backendQuery, range } = parseLineRangeInMention(query)

        // Adapt the VS Code webview messaging API to be RPC-like for ease of use by our callers.
        return new Promise<{
            items: ContextItem[]
            mentionProviders: ContextMentionProviderInformation[]
        }>((resolve, reject) => {
            const vscodeApi = getVSCodeAPI()
            vscodeApi.postMessage({ command: 'getUserContext', query: backendQuery, range })

            const RESPONSE_MESSAGE_TYPE = 'userContext' as const

            // Clean up after a while to avoid resource exhaustion in case there is a bug
            // somewhere.
            const MAX_WAIT_SECONDS = 15
            const rejectTimeout = setTimeout(() => {
                reject(new Error(`no ${RESPONSE_MESSAGE_TYPE} response after ${MAX_WAIT_SECONDS}s`))
                dispose()
            }, MAX_WAIT_SECONDS * 1000)

            // Wait for the response. We assume the first message of the right type is the response to
            // our call.
            const dispose = vscodeApi.onMessage(message => {
                if (message.type === RESPONSE_MESSAGE_TYPE) {
                    const itemsWithRange = message.items?.map(item =>
                        range ? { ...item, range } : item
                    )
                    resolve({
                        items: itemsWithRange ?? [],
                        mentionProviders: message.mentionProviders ?? [],
                    })
                    dispose()
                    clearTimeout(rejectTimeout)
                }
            })
        })
    },
})

export const WithChatContextClient: FunctionComponent<
    React.PropsWithChildren<{ value: ChatContextClient }>
> = ({ value, children }) => (
    <ChatContextClientContext.Provider value={value}>{children}</ChatContextClientContext.Provider>
)

function useChatContextClient(): ChatContextClient {
    return useContext(ChatContextClientContext)
}

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(
    query: string | null
): [ContextItem[] | undefined, ContextMentionProviderInformation[] | undefined] {
    const chatContextClient = useChatContextClient()
    const [items, setItems] = useState<ContextItem[]>()
    const [mentionProviders, setMentionProviders] = useState<ContextMentionProviderInformation[]>()
    // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to run this when query changes.
    useEffect(() => {
        // An empty query is a valid query that we use to get open tabs context,
        // while a null query means this is not an at-mention query.
        if (query === null) {
            setItems(undefined)
            return
        }

        // If the query ends with a colon, we will reuse current results but remove the range.
        // but only if the provider is the file provider
        if (query.endsWith(':')) {
            const selected = items?.find(r => displayPath(r.uri) === query.slice(0, -1))
            setItems(
                selected
                    ? [{ ...selected, range: undefined }]
                    : items?.map(r => ({ ...r, range: undefined }))
            )
            return
        }

        // If user is typing a line range, fetch new chat context items only if there are no results
        if (items?.length && RANGE_MATCHES_REGEXP.test(query) && !LINE_RANGE_REGEXP.test(query)) {
            return
        }

        // Track if the query changed since this request was sent (which would make our results
        // no longer valid).
        let invalidated = false

        if (chatContextClient) {
            chatContextClient
                .getChatContext(query)
                .then(response => {
                    if (invalidated) {
                        return
                    }
                    setItems(response.items)
                    setMentionProviders(response.mentionProviders)
                })
                .catch(error => {
                    setItems(undefined)
                    setMentionProviders(undefined)
                    console.error(error)
                })
        }

        return () => {
            invalidated = true
        }
    }, [query])
    return [items, mentionProviders] as const
}

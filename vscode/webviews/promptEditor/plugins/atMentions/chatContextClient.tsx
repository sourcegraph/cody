import { type ContextItem, displayPath } from '@sourcegraph/cody-shared'
import { type FunctionComponent, createContext, useContext, useEffect, useState } from 'react'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'
import { LINE_RANGE_REGEXP, RANGE_MATCHES_REGEXP, parseLineRangeInMention } from './atMentions'

export interface ChatContextClient {
    getChatContextItems(query: string): Promise<ContextItem[]>
}

const ChatContextClientContext: React.Context<ChatContextClient> = createContext({
    getChatContextItems(query: string): Promise<ContextItem[]> {
        // TODO(sqs): Would be best to handle line ranges on the backend, not here.
        const { textWithoutRange: backendQuery, range } = parseLineRangeInMention(query)

        // Adapt the VS Code webview messaging API to be RPC-like for ease of use by our callers.
        return new Promise<ContextItem[]>((resolve, reject) => {
            const vscodeApi = getVSCodeAPI()
            vscodeApi.postMessage({ command: 'getUserContext', query: backendQuery })

            const RESPONSE_MESSAGE_TYPE = 'userContextFiles' as const

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
                    const resultsWithRange = message.userContextFiles?.map(item =>
                        range ? { ...item, range } : item
                    )
                    resolve(resultsWithRange ?? [])
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
export function useChatContextItems(query: string | null): ContextItem[] | undefined {
    const chatContextClient = useChatContextClient()
    const [results, setResults] = useState<ContextItem[]>()
    // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to run this when query changes.
    useEffect(() => {
        // An empty query is a valid query that we use to get open tabs context,
        // while a null query means this is not an at-mention query.
        if (query === null) {
            setResults(undefined)
            return
        }

        // If the query ends with a colon, we will reuse current results but remove the range.
        if (query.endsWith(':')) {
            const selected = results?.find(r => displayPath(r.uri) === query.slice(0, -1))
            const updatedResults = selected ? [selected] : results
            setResults(updatedResults?.map(r => ({ ...r, range: undefined })))
            return
        }

        // If user is typing a line range, no need to fetch new chat context items.
        if (results?.length && RANGE_MATCHES_REGEXP.test(query)) {
            if (!LINE_RANGE_REGEXP.test(query)) {
                return
            }
        }

        // Track if the query changed since this request was sent (which would make our results
        // no longer valid).
        let invalidated = false

        if (chatContextClient) {
            chatContextClient
                .getChatContextItems(query)
                .then(mentions => {
                    if (invalidated) {
                        return
                    }
                    setResults(mentions)
                })
                .catch(error => {
                    setResults(undefined)
                    console.error(error)
                })
        }

        return () => {
            invalidated = true
        }
    }, [query])
    return results
}

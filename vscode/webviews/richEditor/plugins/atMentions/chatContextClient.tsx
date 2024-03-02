import type { ContextItem } from '@sourcegraph/cody-shared'
import { createContext, useContext, useEffect, useState } from 'react'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'

export interface ChatContextClient {
    getChatContextItems(query: string): Promise<ContextItem[]>
}

const ChatContextClientContext: React.Context<ChatContextClient> = createContext({
    getChatContextItems(query: string): Promise<ContextItem[]> {
        // Adapt the VS Code webview messaging API to be RPC-like for ease of use by our callers.
        return new Promise<ContextItem[]>((resolve, reject) => {
            const vscodeApi = getVSCodeAPI()
            vscodeApi.postMessage({ command: 'getUserContext', query })

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
                    resolve(message.userContextFiles ?? [])
                    dispose()
                    clearTimeout(rejectTimeout)
                }
            })
        })
    },
})

export const WithChatContextClient: React.FunctionComponent<
    React.PropsWithChildren<{ value: ChatContextClient }>
> = ({ value, children }) => (
    <ChatContextClientContext.Provider value={value}>{children}</ChatContextClientContext.Provider>
)

function useChatContextClient(): ChatContextClient {
    return useContext(ChatContextClientContext)
}

/** Hook to get the chat context items for the given query. */
export function useChatContextItems(query: string): ContextItem[] | undefined {
    const chatContextClient = useChatContextClient()
    const [results, setResults] = useState<ContextItem[]>()
    useEffect(() => {
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
    }, [chatContextClient, query])
    return results
}

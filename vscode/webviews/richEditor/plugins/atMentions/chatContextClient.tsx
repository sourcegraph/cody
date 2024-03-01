import type { ContextFile } from '@sourcegraph/cody-shared'
import { createContext, useContext } from 'react'
import { getVSCodeAPI } from '../../../utils/VSCodeApi'

export interface ChatContextClient {
    getChatContextItems(query: string): Promise<ContextFile[]>
}

const ChatContextClientContext: React.Context<ChatContextClient> = createContext({
    getChatContextItems(query: string): Promise<ContextFile[]> {
        // Adapt the VS Code webview messaging API to be RPC-like for ease of use by our callers.
        return new Promise<ContextFile[]>((resolve, reject) => {
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

export function useChatContextClient(): ChatContextClient {
    return useContext(ChatContextClientContext)
}

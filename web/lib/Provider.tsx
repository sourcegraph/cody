import { URI } from 'vscode-uri';
import type { MessageConnection } from 'vscode-jsonrpc/browser';
import {
    createContext,
    FC,
    PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    MutableRefObject
} from 'react'

import { ExtensionMessage } from '@sourcegraph/vscode-cody/src/chat/protocol';
import { setVSCodeWrapper, VSCodeWrapper } from '@sourcegraph/vscode-cody/webviews/utils/VSCodeApi';
import { hydrateAfterPostMessage, isErrorLike, SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared';

import { createAgentClient } from './agent/client';
import { useLocalStorage } from './utils/use-local-storage';
import { ChatExportResult } from '@sourcegraph/vscode-cody/src/jsonrpc/agent-protocol';
import { InitialContext } from './types';
import { UriComponents } from 'vscode-uri/lib/umd/uri';

/**
 * Local storage key for storing last active chat id, preserving
 * chat id in the local storage allows us to restore the last active chat
 * as you open/render Cody Web Chat.
 */
const ACTIVE_CHAT_ID_KEY = 'cody-web.last-active-chat-id'

interface AgentClient {
    rpc: MessageConnection
    dispose(): void
}

interface CodyWebChatContextData {
    client: AgentClient | Error | null
    lastActiveChatID: string | null
    activeWebviewPanelID: MutableRefObject<string>
    initialContext: InitialContext
    vscodeAPI: VSCodeWrapper
    graphQLClient: SourcegraphGraphQLAPIClient
    setLastActiveChatID: (chatID: string|null) => void
}

export const CodyWebChatContext = createContext<CodyWebChatContextData>({
    client: null,
    lastActiveChatID: null,
    activeWebviewPanelID: { current: '' },
    initialContext: { repositories: [] },

    // Null casting is just to avoid unnecessary null type checks in
    // consumers, CodyWebChatProvider creates graphQL vscodeAPI and graphql client
    // unconditionally, so this is safe to provide null as a default value here
    vscodeAPI: null as any,
    graphQLClient: null as any,
    setLastActiveChatID: () => {}
})

interface CodyWebChatProviderProps {
    serverEndpoint: string
    accessToken: string | null
    initialContext: InitialContext
}

/**
 * The root store/provider node for the Cody Web chat, creates and shares
 * agent client and maintains active web panel ID, chat history and vscodeAPI.
 */
export const CodyWebChatProvider: FC<PropsWithChildren<CodyWebChatProviderProps>> = props => {
    const { serverEndpoint, accessToken, initialContext, children } = props

    // In order to avoid multiple client creation during dev runs
    // since useEffect can be fired multiple times during dev builds
    const isClientInitialized = useRef(false)
    const onMessageCallbacksRef = useRef<((message: ExtensionMessage) => void)[]>([])

    const activeWebviewPanelID = useRef<string>('')
    const [client, setClient] = useState<AgentClient | Error | null>(null)
    const [lastActiveChatID, setLastActiveChatID] = useLocalStorage<string|null>(ACTIVE_CHAT_ID_KEY, null)

    // TODO [VK] Memoize agent client creation to avoid re-creating client
    useEffect(() => {
        ;(async () => {
            if (isClientInitialized.current) {
                return
            }

            isClientInitialized.current = true

            try {
                const client = await createAgentClient({
                    workspaceRootUri: '',
                    serverEndpoint: serverEndpoint,
                    accessToken: accessToken ?? '',
                })

                // Fetch existing chats from the agent chat storage
                const chatHistory = await client.rpc.sendRequest<ChatExportResult[]>('chat/export', null)

                // In case of no chats we should create initial empty chat
                if (chatHistory.length === 0) {
                    activeWebviewPanelID.current = await client.rpc.sendRequest('chat/new', {
                        repositories: initialContext.repositories,
                        file: initialContext.fileURL
                            ? {
                                scheme: 'remote-file',
                                authority: initialContext.repositories[0].name,
                                path: initialContext.fileURL
                            } as UriComponents
                            : undefined
                    })
                } else {
                    // Activate either last active chat by ID from local storage or
                    // set the last created chat from the history
                    const lastUsedChat = chatHistory.find(chat => chat.chatID === lastActiveChatID)
                    const lastActiveChat = lastUsedChat ?? chatHistory[chatHistory.length - 1]

                    activeWebviewPanelID.current = await client.rpc.sendRequest('chat/restore', {
                        chatID: lastActiveChat.chatID,
                        messages: lastActiveChat.transcript.interactions.map(interaction => {
                            return [interaction.humanMessage, interaction.assistantMessage].filter(message => message)
                        }).flat()
                    })

                    setLastActiveChatID(lastActiveChat.chatID)
                }

                setClient(client)
            } catch (error) {
                console.error(error)
                setClient(() => error as Error)
            }
        })()
    }, [])

    // Internal graphQL client, turning off telemetry to avoid
    // unwanted "synthetic" telemetry calls
    const graphQLClient = useMemo(() => {
        return new SourcegraphGraphQLAPIClient({
            accessToken,
            serverEndpoint,
            customHeaders: {},
            telemetryLevel: 'off'
        })
    }, [])

    const vscodeAPI = useMemo<VSCodeWrapper>(() => {
        if (client && !isErrorLike(client)) {
            client.rpc.onNotification(
                'webview/postMessage',
                ({ id, message }: { id: string; message: ExtensionMessage }) => {
                    if (activeWebviewPanelID.current === id) {
                        for (const callback of onMessageCallbacksRef.current) {
                            callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                        }
                    }
                }
            )
        }

        const vscodeAPI: VSCodeWrapper = {
            postMessage: message => {
                if (client && !isErrorLike(client)) {
                    void client.rpc.sendRequest('webview/receiveMessage', {
                        id: activeWebviewPanelID.current,
                        message,
                    })
                }
            },
            onMessage: callback => {
                if (client && !isErrorLike(client)) {
                    onMessageCallbacksRef.current.push(callback)
                    return () => {
                        // Remove callback from onMessageCallbacks.
                        const index = onMessageCallbacksRef.current.indexOf(callback)
                        if (index >= 0) {
                            onMessageCallbacksRef.current.splice(index, 1)
                        }
                    }
                }
                return () => {}
            },
            getState: () => {
                throw new Error('not implemented')
            },
            setState: () => {
                throw new Error('not implemented')
            },
        }

        // Runtime sync side effect, ensure that later any cody UI
        // components will have access to the mocked/synthetic VSCode API
        setVSCodeWrapper(vscodeAPI)
        return vscodeAPI
    }, [client, activeWebviewPanelID])

    return (
        <CodyWebChatContext.Provider value={{
            client,
            vscodeAPI,
            graphQLClient,
            activeWebviewPanelID,
            lastActiveChatID,
            setLastActiveChatID,
            initialContext,
        }}>
            { children }
        </CodyWebChatContext.Provider>
    )
}

export function useWebAgentClient(): CodyWebChatContextData {
    return useContext(CodyWebChatContext)
}

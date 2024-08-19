import {
    type FunctionComponent,
    type PropsWithChildren,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import type { MessageConnection } from 'vscode-jsonrpc/browser'
import { URI } from 'vscode-uri'

import { hydrateAfterPostMessage, isErrorLike } from '@sourcegraph/cody-shared'
import type { ExtensionMessage } from 'cody-ai/src/chat/protocol'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import { type VSCodeWrapper, setVSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import { createAgentClient } from '../agent/agent.client'
import type { InitialContext } from '../types'

// Usually the CodyWebPanelProvider VSCode API wrapper listens only to messages from the Extension host
// which matches the current active panel id. But this message id check can be corrupted
// by race conditions in different events that the extension host sends during chat-switching.
// Some events should always be handled by the client regardless of which active panel they
// came from.
const GLOBAL_MESSAGE_TYPES: Array<ExtensionMessage['type']> = ['rpc/response']

interface AgentClient {
    rpc: MessageConnection
    dispose(): void
}

interface CodyWebPanelContextData {
    client: AgentClient | Error | null
    activeWebviewPanelID: string
    vscodeAPI: VSCodeWrapper
    initialContext: InitialContext | undefined
}

export const CodyWebPanelContext = createContext<CodyWebPanelContextData>({
    client: null,
    activeWebviewPanelID: '',
    initialContext: undefined,

    // Null casting is just to avoid unnecessary null type checks in
    // consumers, CodyWebPanelProvider creates graphQL vscodeAPI and graphql client
    // unconditionally, so this is safe to provide null as a default value here
    vscodeAPI: null as any,
})

interface CodyWebPanelProviderProps {
    serverEndpoint: string
    accessToken: string | null
    createAgentWorker: () => Worker
    telemetryClientName?: string
    initialContext?: InitialContext
    customHeaders?: Record<string, string>
}

/**
 * The root store/provider node for Cody Web, creates and shares
 * agent client and maintains active web panel ID, chat history and vscodeAPI.
 */
export const CodyWebPanelProvider: FunctionComponent<PropsWithChildren<CodyWebPanelProviderProps>> = ({
    serverEndpoint,
    accessToken,
    createAgentWorker,
    initialContext,
    telemetryClientName,
    children,
    customHeaders,
}) => {
    // In order to avoid multiple client creation during dev runs
    // since useEffect can be fired multiple times during dev builds
    const isClientInitialized = useRef(false)
    const activeWebviewPanelIDRef = useRef<string>('')
    const onMessageCallbacksRef = useRef<((message: ExtensionMessage) => void)[]>([])

    const [activeWebviewPanelID, setActiveWebviewPanelID] = useState<string>('')
    const [client, setClient] = useState<AgentClient | Error | null>(null)

    activeWebviewPanelIDRef.current = activeWebviewPanelID

    // TODO [VK] Memoize agent client creation to avoid re-creating client
    useEffect(() => {
        ;(async () => {
            if (isClientInitialized.current) {
                return
            }

            isClientInitialized.current = true

            try {
                const client = await createAgentClient({
                    customHeaders,
                    telemetryClientName,
                    createAgentWorker,
                    workspaceRootUri: '',
                    serverEndpoint: serverEndpoint,
                    accessToken: accessToken ?? '',
                })

                // Create an new chat each time.
                await createChat(client)

                setClient(client)
            } catch (error) {
                console.error(error)
                setClient(() => error as Error)
            }
        })()
    }, [accessToken, serverEndpoint, createAgentWorker, customHeaders, telemetryClientName])

    const createChat = useCallback(
        async (agent = client) => {
            if (!agent || isErrorLike(agent)) {
                return
            }

            const { panelId, chatId } = await agent.rpc.sendRequest<{
                panelId: string
                chatId: string
            }>('chat/web/new', null)

            activeWebviewPanelIDRef.current = panelId

            setActiveWebviewPanelID(panelId)

            await agent.rpc.sendRequest('webview/receiveMessage', {
                id: activeWebviewPanelIDRef.current,
                message: { chatID: chatId, command: 'restoreHistory' },
            })

            // Set initial context after we restore history so context won't be
            // overridden by the previous chat session context
            if (initialContext?.repositories.length) {
                await agent.rpc.sendRequest('webview/receiveMessage', {
                    id: activeWebviewPanelIDRef.current,
                    message: {
                        command: 'context/choose-remote-search-repo',
                        explicitRepos: initialContext?.repositories ?? [],
                    },
                })
            }
        },
        [client, initialContext]
    )

    const vscodeAPI = useMemo<VSCodeWrapper | null>(() => {
        if (!client) {
            return null
        }
        if (!isErrorLike(client)) {
            client.rpc.onNotification(
                'webview/postMessage',
                ({ id, message }: { id: string; message: ExtensionMessage }) => {
                    if (
                        activeWebviewPanelIDRef.current === id ||
                        GLOBAL_MESSAGE_TYPES.includes(message.type)
                    ) {
                        for (const callback of onMessageCallbacksRef.current) {
                            callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                        }
                    }
                }
            )
        }
        const vscodeAPI: VSCodeWrapper = {
            postMessage: message => {
                if (!isErrorLike(client)) {
                    if (message.command === 'command' && message.id === 'cody.chat.new') {
                        void createChat(client)
                        return
                    }
                    void client.rpc.sendRequest('webview/receiveMessage', {
                        id: activeWebviewPanelIDRef.current,
                        message,
                    })
                }
            },
            onMessage: callback => {
                if (!isErrorLike(client)) {
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
    }, [client, createChat])

    const contextInfo = useMemo<CodyWebPanelContextData | null>(
        () =>
            vscodeAPI
                ? {
                      client,
                      vscodeAPI,
                      activeWebviewPanelID,
                      initialContext,
                  }
                : null,
        [client, vscodeAPI, activeWebviewPanelID, initialContext]
    )

    const [initialization, setInitialization] = useState<'init' | 'completed'>('init')
    useLayoutEffect(() => {
        if (initialization === 'completed') {
            return
        }

        if (client && !isErrorLike(client) && activeWebviewPanelID && vscodeAPI) {
            // Notify the extension host that we are ready to receive events.
            vscodeAPI.postMessage({ command: 'ready' })
            vscodeAPI.postMessage({ command: 'initialized' })

            client.rpc
                .sendRequest('webview/receiveMessage', {
                    id: activeWebviewPanelID,
                    message: { command: 'restoreHistory', chatID: null },
                })
                .then(() => {
                    setInitialization('completed')
                })
        }
    }, [initialization, vscodeAPI, activeWebviewPanelID, client])

    return contextInfo ? (
        <AppWrapper>
            <CodyWebPanelContext.Provider value={contextInfo}>{children}</CodyWebPanelContext.Provider>
        </AppWrapper>
    ) : null
}

export function useWebAgentClient(): CodyWebPanelContextData {
    return useContext(CodyWebPanelContext)
}

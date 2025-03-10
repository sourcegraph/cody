import { forceHydration, hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import type { ExtensionMessage } from 'cody-ai/src/chat/protocol'
import { type VSCodeWrapper, setVSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'
import { type MutableRefObject, useEffect, useState } from 'react'
import { URI } from 'vscode-uri'
import { type AgentClient, createAgentClient } from '../agent/agent.client'

/**
 * List of events that bypass active panel ID check in the listeners.
 *
 * Usually the CodyWebPanelProvider VSCode API wrapper listens only to messages from
 * the Extension host which matches the current active panel id. But this message id
 * check can be corrupted by race conditions in different events that the extension
 * host sends during chat-switching. Some events should always be handled by the client
 * regardless of which active panel they came from.
 */
const GLOBAL_MESSAGE_TYPES: Array<ExtensionMessage['type']> = ['rpc/response']

const GLOBAL_AGENT_SHUTDOWN_TIMER = 10 * 60 * 1000 // 10 minutes

export interface CodyWebAgent {
    client: AgentClient
    vscodeAPI: VSCodeWrapper
    createNewChat: () => Promise<void>
}

let globalAgentRefCounter = 0
let globalAgentShutdownTimer: number | undefined
let globalAgent: Promise<CodyWebAgent> | undefined

export interface UseCodyWebAgentInput {
    serverEndpoint: string
    accessToken: string | null
    telemetryClientName?: string
    customHeaders?: Record<string, string>
    createAgentWorker: () => Worker
}

// Cody agent is instantiated the first time a cody web component is initialized.
// To preserve resources we are automatically shutting down the agent when it hasn't
// been referenced for GLOBAL_AGENT_SHUTDOWN_TIMER.

function retainGlobalAgent(): void {
    window.clearTimeout(globalAgentShutdownTimer)
    globalAgentRefCounter += 1
}

function releaseGlobalAgent() {
    if (globalAgentRefCounter > 0) {
        globalAgentRefCounter -= 1
    }

    if (globalAgentRefCounter === 0) {
        globalAgentShutdownTimer = window.setTimeout(() => {
            if (globalAgentRefCounter === 0) {
                globalAgent?.then(agent => agent.client.dispose())
                globalAgent = undefined
            }
        }, GLOBAL_AGENT_SHUTDOWN_TIMER)
    }
}

/**
 * Creates or reuses a cody agent instance. To improve performance we share a single cody agent
 * instance across multiple invocations of cody web.
 */
export function useCodyWebAgent(input: UseCodyWebAgentInput): CodyWebAgent | Error | null {
    const [agent, setAgent] = useState<CodyWebAgent | Error | null>(null)

    // Create global agent here so that we
    if (!globalAgent) {
        globalAgent = createCodyAgent(input)
    }

    useEffect(() => {
        globalAgent?.then(setAgent, setAgent)
        retainGlobalAgent()
        return releaseGlobalAgent
    }, [])

    return agent
}

/**
 * Creates Cody Web Agent instance.
 * Uses cody web-worker agent under the hood with json rpc as a connection between
 * main and web-worker threads, see agent.client.ts for more details
 */
async function createCodyAgent(input: UseCodyWebAgentInput): Promise<CodyWebAgent> {
    const { serverEndpoint, accessToken, telemetryClientName, customHeaders, createAgentWorker } = input

    const activeWebviewPanelIDRef = { current: '' }

    try {
        const client = await createAgentClient({
            customHeaders,
            telemetryClientName,
            serverEndpoint: serverEndpoint,
            accessToken: accessToken ?? '',
            createAgentWorker,
        })

        // Special override for chat creating for Cody Web, otherwise the create new chat doesn't work
        // TODO: Move this special logic to the Cody Web agent handle "chat/web/new"
        const createNewChat = async () => {
            const { panelId, chatId } = await client.rpc.sendRequest<{
                panelId: string
                chatId: string
            }>('chat/web/new', null)

            activeWebviewPanelIDRef.current = panelId

            await client.rpc.sendRequest('webview/receiveMessage', {
                id: activeWebviewPanelIDRef.current,
                message: { chatID: chatId, command: 'restoreHistory' },
            })
        }

        const vscodeAPI = createVSCodeAPI({ activeWebviewPanelIDRef, createNewChat, client: client })
        // Runtime sync side effect, ensure that later any cody UI
        // components will have access to the mocked/synthetic VSCode API
        setVSCodeWrapper(vscodeAPI)
        return { vscodeAPI, createNewChat, client }
    } catch (error) {
        console.error('Cody Web Agent creation failed', error)
        throw error
    }
}

function createVSCodeAPI(input: {
    client: AgentClient
    activeWebviewPanelIDRef: MutableRefObject<string>
    createNewChat: () => Promise<void>
}): VSCodeWrapper {
    const { client, activeWebviewPanelIDRef, createNewChat } = input
    const onMessageCallbacks: ((message: ExtensionMessage) => void)[] = []

    client.rpc.onNotification(
        'webview/postMessage',
        ({ id, message }: { id: string; message: ExtensionMessage }) => {
            if (activeWebviewPanelIDRef.current === id || GLOBAL_MESSAGE_TYPES.includes(message.type)) {
                for (const callback of onMessageCallbacks) {
                    callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                }
            }
        }
    )

    const vscodeAPI: VSCodeWrapper = {
        postMessage: message => {
            // Special override for Cody Web
            if (message.command === 'command' && message.id === 'cody.chat.new') {
                void createNewChat()
                return
            }
            void client.rpc.sendRequest('webview/receiveMessage', {
                id: activeWebviewPanelIDRef.current,
                message: forceHydration(message),
            })
        },
        onMessage: callback => {
            onMessageCallbacks.push(callback)
            return () => {
                // Remove callback from onMessageCallbacks
                const index = onMessageCallbacks.indexOf(callback)
                if (index >= 0) {
                    onMessageCallbacks.splice(index, 1)
                }
            }
        },
        getState: () => {
            throw new Error('not implemented')
        },
        setState: () => {
            throw new Error('not implemented')
        },
    }
    return vscodeAPI
}

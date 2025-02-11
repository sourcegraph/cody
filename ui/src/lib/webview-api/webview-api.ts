import {
    type GenericVSCodeWrapper,
    type UI3WebviewToExtensionAPI,
    type UI3Window,
    type WindowID,
    createMessageAPIForWebview,
    createUI3ExtensionAPI,
    forceHydration,
    hydrateAfterPostMessage,
} from '@sourcegraph/cody-shared'
import { createAgentClient } from '@sourcegraph/cody-web/lib/agent/agent.client'
// @ts-ignore
import AgentWorker from '@sourcegraph/cody-web/lib/agent/agent.worker?worker'
import { URI } from 'vscode-uri'
import type { ExtensionMessage, WebviewMessage } from '../../../../vscode/src/chat/protocol'

interface WebviewAPIClient {
    api: UI3WebviewToExtensionAPI
}

export async function createWebviewAPIClient(): Promise<WebviewAPIClient> {
    const serverEndpoint = localStorage.getItem('serverEndpoint')
    const accessToken = localStorage.getItem('accessToken')
    if (!serverEndpoint || !accessToken) {

        alert(`You need to set an endpoint and token in your browser devtools console by running these commands:
        localStorage.serverEndpoint = 'https://sourcegraph.sourcegraph.com/'
        localStorage.accessToken = 'sgp_MY_TOKEN'
        location.reload()`)

        throw new Error(
            'serverEndpoint and/or accessToken not set (see the source code where this error was thrown for instructions)'
        )
    }

    let vscodeAPI: VSCodeWrapper
    const isVSCodeWebview = typeof acquireVsCodeApi !== 'undefined'
    if (isVSCodeWebview) {
        vscodeAPI = createVSCodeWrapperForVSCodeWebview()
    } else {
        const agentClient = await createAgentClient({
            serverEndpoint,
            accessToken,
            createAgentWorker: CREATE_AGENT_WORKER,
            // trace: true,
        })
        const { windowID } = await agentClient.rpc.sendRequest<{ windowID: WindowID }>(
            'ui3/window/new',
            null
        )
        const win: UI3Window = { id: windowID }
        const onMessageCallbacks: ((message: ExtensionMessage) => void)[] = []

        // Set up transport.
        agentClient.rpc.onNotification(
            'ui3/window/message-from-extension',
            ({ windowID, message }: { windowID: string; message: ExtensionMessage }) => {
                if (win.id === windowID) {
                    for (const callback of onMessageCallbacks) {
                        callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                    }
                } else {
                    // TODO!(sqs)
                    console.error(
                        'Got webview/postMessage for another window, this is unnecessary and just slows stuff down',
                        { messageWindowID: windowID, ourWindowID: win.id, message }
                    )
                }
            }
        )
        vscodeAPI = createVSCodeWrapperForBrowser(agentClient, win, onMessageCallbacks)
    }

    const api = createUI3ExtensionAPI(createMessageAPIForWebview(vscodeAPI))
    return { api }
}

type VSCodeWrapper = GenericVSCodeWrapper<WebviewMessage, ExtensionMessage>

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

/**
 * When running in the browser (not in a VS Code webview), this is how we communicate with the
 * agent running in the Web Worker.
 */
function createVSCodeWrapperForBrowser(
    agentClient: Awaited<ReturnType<typeof createAgentClient>>,
    win: UI3Window,
    onMessageCallbacks: ((message: ExtensionMessage) => void)[]
): VSCodeWrapper {
    return {
        postMessage: message => {
            agentClient.rpc.sendNotification('ui3/window/message-from-webview', {
                windowID: win.id,
                message: forceHydration(message),
            })
        },
        onMessage: callback => {
            onMessageCallbacks.push(callback)
            return () => {
                // On dispose, remove callback from onMessageCallbacks.
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
}

declare const acquireVsCodeApi: () => VSCodeApi

interface VSCodeApi {
    getState: () => unknown
    setState: (newState: unknown) => unknown
    postMessage: (message: unknown) => void
}

let vsCodeApi: VSCodeApi | undefined

/**
 * When running in a VS Code webview (not a web browser), this is how we communicate with the agent
 * running in the extension host.
 */
function createVSCodeWrapperForVSCodeWebview(): VSCodeWrapper {
    if (!vsCodeApi) {
        vsCodeApi = acquireVsCodeApi()
    }
    const api = vsCodeApi
    return {
        postMessage: message => {
            console.log('POSTMESSAGE FROM W TO X', message)
            api.postMessage(forceHydration(message))
        },
        onMessage: callback => {
            const listener = (event: MessageEvent<ExtensionMessage>): void => {
                callback(hydrateAfterPostMessage(event.data, uri => URI.from(uri as any)))
            }
            window.addEventListener('message', listener)
            return () => window.removeEventListener('message', listener)
        },
        setState: newState => api.setState(newState),
        getState: () => api.getState(),
    }
}

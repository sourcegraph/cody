import {
    type GenericVSCodeWrapper,
    type UI3Window,
    type WebviewToExtensionAPI,
    type WindowID,
    createExtensionAPI,
    createMessageAPIForWebview,
    forceHydration,
    hydrateAfterPostMessage,
} from '@sourcegraph/cody-shared'
import { createAgentClient } from '@sourcegraph/cody-web/lib/agent/agent.client'
// @ts-ignore
import AgentWorker from '@sourcegraph/cody-web/lib/agent/agent.worker?worker'
import { URI } from 'vscode-uri'
import type { ExtensionMessage, WebviewMessage } from '../../../../vscode/src/chat/protocol'

const CREATE_AGENT_WORKER = (): Worker => new AgentWorker() as Worker

interface WebviewAPIClient {
    window: UI3Window
    api: WebviewToExtensionAPI
}

export async function createWebviewAPIClient(): Promise<WebviewAPIClient> {
    const serverEndpoint = localStorage.getItem('serverEndpoint')
    const accessToken = localStorage.getItem('accessToken')
    if (!serverEndpoint || !accessToken) {
        // To set your endpoint and token, run the following in your browser devtools console:
        //
        //   localStorage.serverEndpoint = 'https://sourcegraph.sourcegraph.com/'
        //   localStorage.accessToken = 'sgp_MY_TOKEN'
        //   location.reload()
        throw new Error(
            'serverEndpoint and/or accessToken not set (see the source code where this error was thrown for instructions)'
        )
    }

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

    // Set up VS Code API wrapper.
    const isVSCodeWebview = typeof acquireVsCodeApi !== 'undefined'
    const vscodeAPI: VSCodeWrapper = isVSCodeWebview
        ? createVSCodeWrapperForVSCodeWebview()
        : createVSCodeWrapperForBrowser(agentClient, win, onMessageCallbacks)

    const api = createExtensionAPI(createMessageAPIForWebview(vscodeAPI))
    return { window: win, api }
}

type VSCodeWrapper = GenericVSCodeWrapper<WebviewMessage, ExtensionMessage>

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

/**
 * When running in a VS Code webview (not a web browser), this is how we communicate with the agent
 * running in the extension host.
 */
function createVSCodeWrapperForVSCodeWebview(): VSCodeWrapper {
    const vsCodeApi = acquireVsCodeApi()
    return {
        postMessage: message => vsCodeApi.postMessage(forceHydration(message)),
        onMessage: callback => {
            const listener = (event: MessageEvent<ExtensionMessage>): void => {
                callback(hydrateAfterPostMessage(event.data, uri => URI.from(uri as any)))
            }
            window.addEventListener('message', listener)
            return () => window.removeEventListener('message', listener)
        },
        setState: newState => vsCodeApi.setState(newState),
        getState: () => vsCodeApi.getState(),
    }
}

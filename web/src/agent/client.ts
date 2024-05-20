import { hydrateAfterPostMessage } from '@sourcegraph/cody-shared'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageConnection,
    Trace,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import { URI } from 'vscode-uri'
import type { ExtensionMessage } from '../../../vscode/src/chat/protocol'
import { setVSCodeWrapper } from '../../../vscode/webviews/utils/VSCodeApi'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)

export interface AgentClient {
    rpc: MessageConnection
    worker: Worker
    dispose(): void
}

export function createAgentClient(trace = false): AgentClient {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    const rpc = createMessageConnection(
        new BrowserMessageReader(worker),
        new BrowserMessageWriter(worker),
        console
    )
    if (trace) {
        rpc.trace(Trace.Verbose, { log: (...args) => console.debug('agent: debug:', ...args) })
    }
    rpc.onClose(() => {
        console.error('agent: connection closed')
    })
    rpc.listen()

    rpc.onNotification('debug/message', message => {
        if (trace) {
            console.debug('agent: debug:', message)
        }
    })
    rpc.onNotification('webview/postMessage', message => {
        if (trace) {
            console.debug('agent: debug:', message)
        }
    })

    setUpAgent({ rpc })

    return {
        rpc,
        worker,
        dispose(): void {
            rpc.end()
            worker.terminate()
        },
    }
}

interface AgentClientParams {
    serverEndpoint: string
    accessToken: string
    workspaceRootUri: string
}

function setUpAgent(client: Pick<AgentClient, 'rpc'>): void {
    let accessToken = localStorage.getItem('accessToken')
    if (!accessToken) {
        accessToken = window.prompt('Enter a Sourcegraph.com access token:')
        if (!accessToken) {
            throw new Error('No access token provided')
        }
        localStorage.setItem('accessToken', accessToken)
    }

    const params: AgentClientParams = {
        serverEndpoint: 'https://sourcegraph.com',
        accessToken: accessToken ?? '',
        workspaceRootUri: 'file:///tmp/foo',
    }

    const webviewPanelID = initializeAgentClient(client, params).then(result => result.webviewPanelID)
    webviewPanelID.catch(console.error)

    const onMessageCallbacks: ((message: ExtensionMessage) => void)[] = []
    client.rpc.onNotification(
        'webview/postMessage',
        async ({ id, message }: { id: string; message: ExtensionMessage }) => {
            if ((await webviewPanelID) === id) {
                for (const callback of onMessageCallbacks) {
                    callback(hydrateAfterPostMessage(message, uri => URI.from(uri as any)))
                }
            }
        }
    )

    setVSCodeWrapper({
        postMessage: async message => {
            void client.rpc.sendRequest('webview/receiveMessage', {
                id: await webviewPanelID,
                message,
            })
        },
        onMessage: callback => {
            onMessageCallbacks.push(callback)
            return () => {
                // Remove callback from onMessageCallbacks.
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
    })
}

async function initializeAgentClient(
    { rpc }: Pick<AgentClient, 'rpc'>,
    params: AgentClientParams
): Promise<{ webviewPanelID: string }> {
    await rpc.sendRequest('initialize', {
        name: 'cody-web',
        version: '0.0.1',
        workspaceRootUri: params.workspaceRootUri,
        extensionConfiguration: {
            serverEndpoint: params.serverEndpoint,
            accessToken: params.accessToken,
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.urlContext': true,
                'cody.experimental.noodle': true,
                'cody.autocomplete.enabled': false,
            },
        },
    })
    rpc.sendNotification('initialized', null)

    return {
        webviewPanelID: await rpc.sendRequest('chat/new', null),
    }
}

import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageConnection,
    Trace,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import type { ServerInfo } from '../../../vscode/src/jsonrpc/agent-protocol'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)

export interface AgentClient {
    serverInfo: ServerInfo
    webviewPanelID: string
    rpc: MessageConnection
    dispose(): void
}

export interface AgentClientOptions {
    serverEndpoint: string
    accessToken: string
    workspaceRootUri: string
    debug?: boolean
    trace?: boolean
}

export async function createAgentClient({
    serverEndpoint,
    accessToken,
    workspaceRootUri,
    debug = true,
    trace = false,
}: AgentClientOptions): Promise<AgentClient> {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    // worker.addEventListener('error', event => {
    //     console.error('worker error:', event)
    // })
    // worker.addEventListener('messageerror', event => {
    //     console.error('worker messageerror:', event)
    // })
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
    // rpc.onError(error => {
    //     console.error('agent: connection error:', error)
    // })
    rpc.listen()

    rpc.onNotification('debug/message', message => {
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })
    rpc.onNotification('webview/postMessage', message => {
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })

    const serverInfo: ServerInfo = await rpc.sendRequest('initialize', {
        name: 'cody-web',
        version: '0.0.1',
        workspaceRootUri,
        extensionConfiguration: {
            serverEndpoint,
            accessToken,
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.urlContext': true,
                'cody.autocomplete.enabled': false,
            },
        },
    })
    rpc.sendNotification('initialized', null)

    const webviewPanelID: string = await rpc.sendRequest('chat/new', null)

    return {
        serverInfo,
        rpc,
        webviewPanelID,
        dispose(): void {
            rpc.end()
            worker.terminate()
        },
    }
}

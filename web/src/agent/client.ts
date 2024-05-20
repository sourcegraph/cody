import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageConnection,
    Trace,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)

export interface AgentClient {
    rpc: MessageConnection
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

    return {
        rpc,
        dispose(): void {
            rpc.end()
            worker.terminate()
        },
    }
}

export async function initializeAgentClient(
    { rpc }: AgentClient,
    params: { serverEndpoint: string; accessToken: string; workspaceRootUri: string }
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

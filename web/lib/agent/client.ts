import {
    Trace,
    BrowserMessageReader,
    BrowserMessageWriter,
    createMessageConnection,
    type MessageConnection,
} from 'vscode-jsonrpc/browser'
import type { ServerInfo } from '@sourcegraph/vscode-cody/src/jsonrpc/agent-protocol'

// Inline Agent web worker since we're building cody/web package
// in the cody repository and ship it via published npm package
// Inlining allows us to not handle web-worker entry point on the
// consumer side, it brings its own problems but this is temporally
// solution while we don't have a clear package separation in the
// cody repository

// @ts-ignore
import AgentWorker from './worker.ts?worker&inline'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)
export interface AgentClient {
    serverInfo: ServerInfo
    rpc: MessageConnection
    dispose(): void
}

interface AgentClientOptions {
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

    // Run agent worker and set up a transport bridge between
    // main thread and web-worker thread via json-rpc protocol
    const worker = new AgentWorker() as Worker
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
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })
    rpc.onNotification('webview/postMessage', message => {
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })

    // Initialize
    const serverInfo: ServerInfo = await rpc.sendRequest('initialize', {
        name: 'cody-web',
        version: '0.0.1',
        workspaceRootUri,
        extensionConfiguration: {
            serverEndpoint,
            accessToken,
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.noodle': true,
                'cody.autocomplete.enabled': false,
                'cody.experimental.urlContext': true,
            },
        },
    })

    await rpc.sendNotification('initialized', null)

    return {
        rpc,
        serverInfo,
        dispose(): void {
            rpc.end()
            worker.terminate()
        },
    }
}

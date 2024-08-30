import type { ClientInfo, ServerInfo } from 'cody-ai/src/jsonrpc/agent-protocol'
import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageConnection,
    Trace,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)
interface AgentClient {
    serverInfo: ServerInfo
    rpc: MessageConnection
    dispose(): void
}

interface AgentClientOptions {
    serverEndpoint: string
    accessToken: string
    createAgentWorker: () => Worker
    workspaceRootUri: string
    telemetryClientName?: string
    customHeaders?: Record<string, string>
    debug?: boolean
    trace?: boolean
}

export async function createAgentClient({
    serverEndpoint,
    accessToken,
    createAgentWorker,
    workspaceRootUri,
    customHeaders,
    telemetryClientName,
    debug = true,
    trace = false,
}: AgentClientOptions): Promise<AgentClient> {
    // Run agent worker and set up a transport bridge between
    // main thread and web-worker thread via json-rpc protocol
    const worker = createAgentWorker()
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
        name: 'web',
        version: '0.0.1',
        workspaceRootUri,
        capabilities: {
            completions: 'none',
            webview: 'agentic',
        },
        extensionConfiguration: {
            accessToken,
            serverEndpoint,
            telemetryClientName,
            customHeaders: customHeaders ?? {},
            customConfiguration: {
                'cody.autocomplete.enabled': false,
                'cody.experimental.urlContext': true,
                'cody.web': true,
            },
        },
    } satisfies ClientInfo)

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

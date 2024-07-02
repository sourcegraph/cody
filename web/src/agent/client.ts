import {
    BrowserMessageReader,
    BrowserMessageWriter,
    type MessageConnection,
    Trace,
    createMessageConnection,
} from 'vscode-jsonrpc/browser'
import type { ChatExportResult, ServerInfo } from '../../../vscode/src/jsonrpc/agent-protocol'

// TODO(sqs): dedupe with agentClient.ts in [experimental Cody CLI](https://github.com/sourcegraph/cody/pull/3418)

export interface AgentClient {
    serverInfo: ServerInfo
    webviewPanelID: string
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
                'cody.experimental.noodle': true,
                'cody.autocomplete.enabled': false,
                'cody.experimental.urlContext': true,
                'cody.allow-remote-context': true,
            },
        },
    })
    rpc.sendNotification('initialized', null)

    let webviewPanelID = ''
    const chatHistory = await rpc.sendRequest<ChatExportResult[]>('chat/export', null)

    if (chatHistory.length > 0) {
        const chat = chatHistory[chatHistory.length - 1]
        webviewPanelID = await rpc.sendRequest('chat/restore', {
            chatID: chat.chatID,
            messages: chat.transcript.interactions.flatMap(interaction =>
                // Ignore incomplete messages from bot, this might be possible
                // if chat was closed before LLM responded with a final message chunk
                [interaction.humanMessage, interaction.assistantMessage].filter(message => message)
            ),
        })
    } else {
        webviewPanelID = await rpc.sendRequest('chat/new', null)
    }

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

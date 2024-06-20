import { type ChildProcessWithoutNullStreams, fork } from 'node:child_process'
import { displayLineRange } from '@sourcegraph/cody-shared'
import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import { URI } from 'vscode-uri'
import type { ExtensionMessage, ExtensionTranscriptMessage } from '../../vscode/src/chat/protocol'
import type { ServerInfo } from '../../vscode/src/jsonrpc/agent-protocol'
import { MessageHandler } from '../../vscode/src/jsonrpc/jsonrpc'

interface AgentClient {
    serverInfo: ServerInfo
    chat(message: string, options: ChatOptions): Promise<ChatResult>
    dispose(): void
}

interface AgentClientOptions {
    serverEndpoint: string
    accessToken: string
    workspaceRootUri: string
    debug?: boolean
}

interface ChatOptions {
    model?: string
    contextRepositoryNames?: string[]
}

interface ChatResult {
    text: string
    contextFiles: string[]
}

export async function createAgentClient({
    serverEndpoint,
    accessToken,
    workspaceRootUri,
    debug = false,
}: AgentClientOptions): Promise<AgentClient> {
    const agentProcess = spawnAgent()

    const conn = createMessageConnection(
        new StreamMessageReader(agentProcess.stdout),
        new StreamMessageWriter(agentProcess.stdin)
    )
    const rpc = new MessageHandler(conn)

    rpc.registerNotification('debug/message', message => {
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })
    rpc.registerNotification('webview/postMessage', message => {
        if (debug) {
            console.debug('agent: debug:', message)
        }
    })
    conn.listen()

    const serverInfo = await rpc.request('initialize', {
        name: 'cody-cli',
        version: '0.0.1',
        workspaceRootUri,
        extensionConfiguration: {
            serverEndpoint: serverEndpoint,
            accessToken,
            customHeaders: {},
        },
    })
    rpc.notify('initialized', null)

    let disposed = false
    function spawnAgent(): ChildProcessWithoutNullStreams {
        // This works both when running normally as `node cody-agent.js` and when using the
        // self-contained executables built by `pnpm -C agent run build-agent-binaries`. See
        // https://github.com/vercel/pkg#snapshot-filesystem.
        const agentProcess = fork(process.argv[1], ['jsonrpc'], {
            stdio: 'pipe',
            env: {
                ...process.env,
                NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --enable-source-maps`,
            },
        })

        agentProcess.on('close', () => {
            if (!disposed) {
                console.error('agent: close')
                process.exit(1)
            }
        })
        agentProcess.on('error', error => {
            console.error('agent: error:', error)
            process.exit(1)
        })
        agentProcess.on('exit', code => {
            if (disposed) {
                process.exit(code ?? 0)
            }
            console.error(`agent: exit with code ${code}`)
            process.exit(1)
        })
        if (!agentProcess.stderr || !agentProcess.stdout || !agentProcess.stdin) {
            console.error('agent: invalid stdio')
            process.exit(1)
        }
        agentProcess.stderr!.on('data', data => {
            console.error(`----agent stderr----\n${data}\n--------------------`)
        })

        return agentProcess as ChildProcessWithoutNullStreams
    }

    return {
        serverInfo,
        async chat(message: string, options: ChatOptions): Promise<ChatResult> {
            const id = await rpc.request('chat/new', null)

            if (options.model) {
                await rpc.request('webview/receiveMessage', {
                    id,
                    message: {
                        command: 'chatModel',
                        model: options.model,
                    },
                })
            }

            if (options.contextRepositoryNames && options.contextRepositoryNames.length > 0) {
                const { repos } = await rpc.request('graphql/getRepoIds', {
                    names: options.contextRepositoryNames,
                    first: options.contextRepositoryNames.length,
                })
                await rpc.request('webview/receiveMessage', {
                    id,
                    message: {
                        command: 'context/choose-remote-search-repo',
                        explicitRepos: repos,
                    },
                })
            }

            const transcript = asTranscriptMessage(
                await rpc.request('chat/submitMessage', {
                    id,
                    message: {
                        command: 'submit',
                        submitType: 'user',
                        text: message,
                        contextFiles: [],
                        addEnhancedContext: true,
                    },
                })
            )

            const sentMessage = transcript.messages.at(0)
            if (!sentMessage) {
                throw new Error('invalid transcript')
            }

            const reply = transcript.messages.at(-1)
            if (!reply) {
                throw new Error('no reply')
            }
            if (reply.error) {
                throw new Error(`error reply: ${reply.error.message}`)
            }

            return {
                text: reply.text ?? '',
                contextFiles:
                    sentMessage.contextFiles?.map(c =>
                        c.repoName
                            ? // TODO(sqs): Fix URL-encoding for Sourcegraph URLs.
                              URI.revive(c.uri)
                                  .toString()
                                  .replace('.com//', '.com/')
                                  .replace('%40', '@')
                            : `${c.uri.path}${c.range ? `?L${displayLineRange(c.range)}` : ''}`
                    ) ?? [],
            }
        },
        dispose(): void {
            disposed = true
            rpc.exit()
            agentProcess.kill()
        },
    }
}

function asTranscriptMessage(reply: ExtensionMessage): ExtensionTranscriptMessage {
    if (reply.type === 'transcript') {
        return reply
    }
    throw new Error(`expected transcript, got: ${JSON.stringify(reply)}`)
}

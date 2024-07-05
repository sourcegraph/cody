import { logDebug, logError } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import { WebSocketServer } from 'ws'
import { newAgentClient } from '../agent'
import type { RpcMessageHandler } from '../jsonrpc-alias'
import { intOption } from './command-bench/cli-parsers'

interface ServerOptions {
    port: number
}

export const serverCommand = new Command('jsonrpc-websocket')
    .description(
        'Start a server that opens JSON-RPC connections through websockets. This command does not work at the moment.'
    )
    .option('--port <number>', 'Which port to listen to', intOption, 7000)
    .action(async (options: ServerOptions) => {
        const wss = new WebSocketServer({
            port: options.port,
        })
        logDebug('cody-server', `Listening... http://localhost:${options.port}`)
        wss.on('connection', async ws => {
            logDebug('cody-server', 'New client')
            let client: RpcMessageHandler | undefined

            ws.on('error', error => logError('cody-server', String(error)))
            ws.on('message', async data => {
                const json = String(data)
                logDebug('cody-server', 'Received message', json)
                if (client === undefined) {
                    client = (
                        await newAgentClient({
                            name: 'cody-server',
                            version: '0.1.0',
                            workspaceRootUri: 'file:///tmp/cody-server',
                        })
                    ).client
                    // TODO(olafurpg/sqs): reimplement with vscode-jsonrpc
                    // agent.fallbackHandler = async msg => {
                    //     ws.send(JSON.stringify(msg))
                    // }
                    const initialized = await client.request('extensionConfiguration/change', {
                        accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalidtoken',
                        serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalidendpoint',
                        customHeaders: {},
                    })
                    console.log({ initialized })
                }

                // TODO(olafurpg/sqs): reimplement with vscode-jsonrpc
                // agent.messageEncoder.send(JSON.parse(String(data)))
            })
        })
    })

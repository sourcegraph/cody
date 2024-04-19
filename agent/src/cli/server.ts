import { logDebug, logError } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import { WebSocketServer } from 'ws'
import { newAgentClient } from '../agent'
import type { MessageHandler } from '../jsonrpc-alias'
import { intOption } from './evaluate-autocomplete/cli-parsers'

interface ServerOptions {
    port: number
}

export const serverCommand = new Command('server')
    .option('--port <number>', 'Which port to listen to', intOption, 7000)
    .action(async (options: ServerOptions) => {
        const wss = new WebSocketServer({
            port: options.port,
        })
        logDebug('cody-server', `Listening... http://localhost:${options.port}`)
        wss.on('connection', async ws => {
            logDebug('cody-server', 'New client')
            let agent: MessageHandler | undefined

            ws.on('error', error => logError('cody-server', String(error)))
            ws.on('message', async data => {
                const json = String(data)
                logDebug('cody-server', 'Received message', json)
                if (agent === undefined) {
                    agent = await newAgentClient({
                        name: 'cody-server',
                        version: '0.1.0',
                        workspaceRootUri: 'file:///tmp/cody-server',
                    })
                    agent.fallbackHandler = async msg => {
                        ws.send(JSON.stringify(msg))
                    }
                    const initialized = await agent.request('extensionConfiguration/change', {
                        accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalidtoken',
                        serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalidendpoint',
                        customHeaders: {},
                    })
                    console.log({ initialized })
                }

                agent.messageEncoder.send(JSON.parse(String(data)))
            })
        })
    })

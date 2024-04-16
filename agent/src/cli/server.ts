import { logDebug, logError } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import { WebSocketServer } from 'ws'
import { newAgentClient } from '../agent'
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
            let requestID = 0
            const requestHandlers = new Map<number, any>()
            const agent = await newAgentClient({
                name: 'cody-server',
                version: '0.1.0',
                workspaceRootUri: 'file:///tmp/cody-server',
            })
            agent.conn.onRequest((method, params, token) => {
                return new Promise<any>((resolve, reject) => {
                    const id = requestID++
                    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
                    requestHandlers.set(id, { resolve, reject })
                    // TODO: send back response
                    token.onCancellationRequested(() => {
                        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: '$/cancelRequest' }))
                    })
                })
            })
            agent.conn.onUnhandledNotification(notification => {
                ws.send(JSON.stringify(notification))
                logDebug('cody-server', 'Unhandled notification', notification)
            })
            const initialized = await agent.request('extensionConfiguration/change', {
                accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalidtoken',
                serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalidendpoint',
                customHeaders: {},
            })

            ws.on('error', error => logError('cody-server', String(error)))
            ws.on('message', async data => {
                const json = String(data)
                logDebug('cody-server', 'Received message', json)
                const message = JSON.parse(json)
                if (!message?.method) {
                    logError('cody-server', 'Invalid message', json)
                    return
                }
                if (message?.id !== undefined) {
                    if (message?.params !== undefined) {
                        agent.conn.sendRequest(message.method, message.params).then(
                            result => {
                                ws.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
                            },
                            error => {
                                ws.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error }))
                            }
                        )
                    } else if (message?.result !== undefined || message?.error !== undefined) {
                        const handler = requestHandlers.get(message.id)
                        if (handler) {
                            if (message?.result !== undefined) handler.resolve(message.result)
                            else handler.reject(message.error)
                        } else {
                            logError('cody-server', 'No handler for request', message)
                        }
                    }
                } else {
                    agent.conn.sendNotification(message.method, message.params)
                }
            })
        })
    })

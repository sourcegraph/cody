import http from 'node:http'
import { agent } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { initializeNetworkAgent } from './fetch.node'

describe('customAgent', () => {
    let server: http.Server
    let url: URL
    beforeEach(
        () =>
            new Promise(resolve => {
                // Create a local http server
                server = http.createServer((req, res) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end('Hello World!')
                })
                server.listen(() => {
                    const address = server.address()
                    if (!address || typeof address !== 'object') {
                        throw new Error('Expected server address to have a port')
                    }

                    url = new URL('http://127.0.0.1:' + address.port)
                    resolve()
                })
            })
    )
    afterEach(() => {
        server.close()
    })

    it('uses keep-alive', async () => {
        initializeNetworkAgent({ extensionUri: vscode.Uri.parse('file:///foo') })

        async function makeRequest() {
            return new Promise<http.IncomingMessage>(resolve => {
                http.get(
                    {
                        host: url.hostname,
                        port: url.port,
                        agent: agent.current?.(url),
                        // Explicit headers because something is clobbering the agent's `keepAlive` option
                        // Omitting this causes all connections to close regardless of `http.proxySupport`
                        headers: { Connection: 'keep-alive' },
                    },
                    r1 => {
                        r1.on('data', () => {})
                        r1.on('end', () => resolve(r1))
                    }
                )
            })
        }

        const r1 = await makeRequest()
        expect(r1.headers.connection).toBe('keep-alive')

        const r2 = await makeRequest()
        expect(r2.headers.connection).toBe('keep-alive')
        expect(r1.socket).toBe(r2.socket)
        expect((r2 as any).req.reusedSocket, 'Request reused TCP socket').toBe(true)
    })
})

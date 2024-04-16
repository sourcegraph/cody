import http from 'node:http'
import { describe, expect, it } from 'vitest'
import { initializeNetworkAgent, setCustomAgent } from './fetch.node'

describe('customAgent', () => {
    it('uses keep-alive', async () => {
        initializeNetworkAgent()
        const agent = setCustomAgent()

        // Create a local http server
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({
                    data: 'Hello World!',
                })
            )
        })
        server.listen(3002, '127.0.0.1')

        const opt: http.RequestOptions = {
            host: '127.0.0.1',
            port: 3002,
            agent: agent(),
            // Explicit headers because something is clobbering the agent's `keepAlive` option
            // Omitting this causes all connections to close regardless of `http.proxySupport`
            headers: { Connection: 'keep-alive' },
        }

        const requests = new Promise(resolve => {
            http.get(opt, r1 => {
                // With explicit header in `opt` -> `undefined` (implies keep the connection alive)
                expect(r1.headers.connection).toSatisfy(val => val === 'keep-alive' || val === undefined)

                // Consume data so we can use the socket again
                r1.on('data', () => {})
                r1.on('end', () => {
                    http.get(opt, r2 => {
                        // `http.proxySupport` set to `off` AND explicit header -> `true`
                        expect((r2 as any).req.reusedSocket).toBe(true)
                        resolve(undefined)
                    })
                })
            })
        })
        await requests
        server.close()
    })
})

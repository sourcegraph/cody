import crypto from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AuthCredentials } from '@sourcegraph/cody-shared'
import { sleep } from '../completions/utils'

const FIVE_MINUTES = 5 * 60 * 1000

// Start a http server on a free port and generate a secure hash. When authenticated, the browser
// will post the auth token to this URL so that we can authenticate even if the redirect does not
// go through.
//
// This works in addition to the existing tokenCallbackHandler and can receive tokens without having
// the user follow a redirect.
export function startTokenReceiver(
    endpoint: string,
    onNewToken: (credentials: Pick<AuthCredentials, 'serverEndpoint' | 'accessToken'>) => void,
    timeout = FIVE_MINUTES
): Promise<string> {
    const endpointUrl = new URL(endpoint)
    const secureToken = crypto.randomBytes(16).toString('hex')

    return new Promise(resolve => {
        const headers = {
            'Access-Control-Allow-Origin': endpointUrl.origin,
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
        }

        const server = http.createServer((req, res) => {
            if (req.method === 'OPTIONS') {
                res.writeHead(200, headers)
                res.end()
            }
            if (req.method === 'POST' && req.url === `/${secureToken}`) {
                let body = ''
                req.on('data', data => {
                    body += data
                })
                req.on('end', () => {
                    try {
                        const json = JSON.parse(body) as unknown
                        if (
                            typeof json === 'object' &&
                            json &&
                            'accessToken' in json &&
                            typeof json.accessToken === 'string'
                        ) {
                            onNewToken({ serverEndpoint: endpoint, accessToken: json.accessToken })

                            res.writeHead(200, headers)
                            res.write('ok')
                            res.end()
                            server.close()
                            return
                        }
                        throw new Error()
                    } catch {
                        res.writeHead(403)
                        res.write('Could not parse body')
                        res.end()
                    }
                })
            } else {
                res.writeHead(404)
                res.write('Not found\n')
                res.end()
            }
        })
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as AddressInfo).port
            const url = `http://127.0.0.1:${port}/${secureToken}`
            resolve(url)
        })

        sleep(timeout).then(() => server.close())
    })
}

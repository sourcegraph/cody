import { test as _test } from '@playwright/test'
import express, { type RequestHandler } from 'express'
import { createProxyMiddleware, proxyEventsPlugin } from 'http-proxy-middleware'
import type { OnProxyEvent } from 'http-proxy-middleware/dist/types'
import 'node:http'
import type { Server as HTTPServer, IncomingMessage, ServerResponse } from 'node:http'
import 'node:https'
import { EventEmitter } from 'node:stream'
import { setTimeout as setPromiseTimeout } from 'node:timers/promises'
import onHeaders from 'on-headers'
import type { TestContext, WorkerContext } from '.'
import type {
    DOTCOM_TESTING_CREDENTIALS,
    ENTERPRISE_TESTING_CREDENTIALS,
} from '../../../../src/testutils/testing-credentials'
import { TESTING_CREDENTIALS } from '../../../../src/testutils/testing-credentials'
import {
    MITM_AUTH_TOKEN_PLACEHOLDER,
    MITM_PROXY_AUTH_AVAILABLE_HEADER,
    MITM_PROXY_AUTH_TOKEN_NAME_HEADER,
    MITM_PROXY_SERVICE_ENDPOINT_HEADER,
    MITM_PROXY_SERVICE_NAME_HEADER,
} from '../constants'
import { getFirstOrValue, rangeOffset } from './util'

/**
 * So many UI interactions require some minimal delay in request responses that
 * by ensuring a consistent floor we can reduce flake between local/CI and
 * polly vs. real requests. At the same time it won't really slow most tests down to have
 * a floor either as requests often run in the background.
 */
const DEFAULT_FLOOR_RESPONSE_TIME = 10 //ms

export interface MitMProxy {
    readonly missingRecording: boolean
    sourcegraph: {
        dotcom: {
            readonly endpoint: string
            readonly proxyTarget: string
            authName: keyof typeof DOTCOM_TESTING_CREDENTIALS
        }
        enterprise: {
            readonly endpoint: string
            readonly proxyTarget: string
            authName: keyof typeof ENTERPRISE_TESTING_CREDENTIALS
        }
    }
    options: {
        responseDelay?: ResponseDelayFn
    }
}

type ProxyReqHandler = (...args: Parameters<Exclude<OnProxyEvent['proxyReq'], undefined>>) => boolean

export const mitmProxyFixture = _test.extend<TestContext, WorkerContext>({
    mitmProxy: [
        async ({ validWorkerOptions, page, browser }, use, testInfo) => {
            const app = express()
            //TODO: Credentials & Configuration TODO: I can see a use-case where
            //you can switch endpoints dynamically. For instance wanting to try
            //signing out of one and then signing into another. You could
            //probably do that already using env variables in the workspace
            //config but it's not a super smooth experience yet. If you run into
            //this please give me a ping so we can brainstorm.
            const allocatedPorts = rangeOffset(
                [testInfo.parallelIndex * 2, 2],
                validWorkerOptions.mitmServerPortRange
            )
            const [sgDotComPort, sgEnterprisePort] = allocatedPorts

            //TODO: cleanup as class
            const state: {
                authName: {
                    enterprise: MitMProxy['sourcegraph']['enterprise']['authName']
                    dotcom: MitMProxy['sourcegraph']['dotcom']['authName']
                }
            } = { authName: { enterprise: 's2', dotcom: 'dotcom' } }

            let missingRecordingTriggered = false
            const config: MitMProxy = {
                get missingRecording() {
                    return missingRecordingTriggered
                },
                sourcegraph: {
                    dotcom: {
                        get authName() {
                            return state.authName.dotcom
                        },
                        set authName(value: MitMProxy['sourcegraph']['dotcom']['authName']) {
                            state.authName.dotcom = value
                        },
                        endpoint: `http://127.0.0.1:${sgDotComPort}`,
                        get proxyTarget() {
                            return TESTING_CREDENTIALS[state.authName.dotcom].serverEndpoint
                        },
                    },
                    enterprise: {
                        get authName() {
                            return state.authName.enterprise
                        },
                        set authName(value: MitMProxy['sourcegraph']['enterprise']['authName']) {
                            state.authName.enterprise = value
                        },
                        endpoint: `http://127.0.0.1:${sgEnterprisePort}`,
                        get proxyTarget() {
                            return TESTING_CREDENTIALS[state.authName.enterprise].serverEndpoint
                        },
                    },
                },
                options: {
                    responseDelay: floorResponseDelayFn(DEFAULT_FLOOR_RESPONSE_TIME),
                },
            }

            // Proxy Middleware has some internal Try/Catch wrapping so not all
            // errors make it out into the test. By creating a manual signal we
            // can ensure that errors inside the middleware always bubble up to
            // a failed test.
            const testFailureSignal = new EventEmitter<{ error: [Error] }>()
            testFailureSignal.on('error', err => {
                if (err.name === 'PollyError') {
                    if (err.message.includes('`recordIfMissing` is `false`')) {
                        missingRecordingTriggered = true
                        console.error('Missing recording')
                    }
                } else {
                    console.error('Error inside MitM proxy', err.message)
                }
                throw err
            })

            const proxyReqHandlers = [
                sourcegraphProxyReqHandler('dotcom', config),
                sourcegraphProxyReqHandler('enterprise', config),
            ]
            const proxyMiddleware = createProxyMiddleware({
                changeOrigin: true,
                ejectPlugins: true,
                prependPath: false,
                preserveHeaderKeyCase: false,
                secure: false,
                plugins: [proxyEventsPlugin],
                router: req => {
                    try {
                        //TODO: convert this to a regex instead
                        const hostPrefix = `http://${req.headers.host}`
                        if (hostPrefix.startsWith(config.sourcegraph.dotcom.endpoint)) {
                            return new URL(req.url ?? '', config.sourcegraph.dotcom.proxyTarget)
                        }
                        if (hostPrefix.startsWith(config.sourcegraph.enterprise.endpoint)) {
                            return new URL(req.url ?? '', config.sourcegraph.enterprise.proxyTarget)
                        }
                        throw new Error('Unknown host prefix')
                    } catch (err) {
                        testFailureSignal.emit('error', err as Error)
                        return undefined
                    }
                },
                on: {
                    error: err => {
                        testFailureSignal.emit('error', err as Error)
                    },
                    proxyReq: (proxyReq, req, res, options) => {
                        try {
                            for (const handler of proxyReqHandlers) {
                                const handlerRes = handler(proxyReq, req, res, options)
                                if (handlerRes) {
                                    return
                                }
                            }
                            throw new Error('No proxy request handler found')
                        } catch (err) {
                            testFailureSignal.emit('error', err as Error)
                        }
                    },
                },
            })

            app.use(delayMiddleware(config), proxyMiddleware)
            const servers: HTTPServer<any, any>[] = []
            const serverPromises = []
            for (const port of allocatedPorts) {
                serverPromises.push(
                    new Promise((resolve, reject) => {
                        const server = app.listen(port, '127.0.0.1', () => {
                            server.listening ? resolve(void 0) : reject("server didn't start")
                        })
                        servers.push(server)
                    })
                )
            }

            const cleanupServers = () => {
                return Promise.allSettled(
                    servers.map(server => {
                        server.closeAllConnections()
                        return new Promise<void>(resolve => server.close(() => resolve(void 0)))
                    })
                )
            }

            try {
                await Promise.all(serverPromises)
            } catch (e) {
                await cleanupServers()
                throw e
            }

            await use(config)
            await cleanupServers()
        },
        { scope: 'test' },
    ],
})

/**
 * This delay middleware applies a configurable delay to proxied requests. It
 * handles both server sent events and normal requests. TODO: Once we refactor
 * this as a class this could simply be a method
 */
function delayMiddleware(proxy: MitMProxy): RequestHandler {
    return (req, res, next) => {
        // we save the delayFn here so that we use the one that was set at the
        // time the request was made

        const delayFn = proxy.options.responseDelay
        if (!delayFn) {
            // if there's no response delay configured we have nothing to do
            next()
            return
        }

        // We keep track of the headers that might indicate if this is a
        // streaming response or not as we need to handle them slightly
        // differently.
        let isStreaming = false

        // Use onHeaders to check final headers just before they're sent
        onHeaders(res, function () {
            isStreaming =
                this.getHeader('content-type') === 'text/event-stream' ||
                this.getHeader('transfer-encoding') === 'chunked'
        })

        const originalSetHeader = res.setHeader
        //@ts-ignore
        res.setHeader = (...args) => {
            const [key, value] = args
            if (key.toLowerCase() === 'content-type' && value === 'text/event-stream') {
                isStreaming = true
            }
            if (key.toLowerCase() === 'transfer-encoding' && value === 'chunked') {
                isStreaming = true
            }
            originalSetHeader.apply(res, args as any)
        }

        // Here we apply the delayFn. For streaming we delay the writes (as the
        // "effects" happen for each write, not as the request ends). For normal
        // requests we simply delay the end. Additionally we need to ensure that
        // there's no delayed pending writes when we call end.

        // we stack pending writes so that the final promise can be awaited in the end-handler
        let pendingWrites = Promise.resolve()
        let startTime = Date.now()
        const originalWrite = res.write
        //@ts-ignore
        res.write = (...args) => {
            if (!isStreaming) {
                originalWrite.apply(res, args as any)
                return
            }

            pendingWrites = pendingWrites.then(async () => {
                const now = Date.now()
                await delayFn(now - startTime, req, res)
                startTime = now // we update the start time so that we consistently apply delays for every partial response
                originalWrite.apply(res, args as any)
            })
        }

        const originalEnd = res.end
        //@ts-ignore
        res.end = (...args) => {
            void pendingWrites.then(async () => {
                if (!isStreaming) {
                    await delayFn(Date.now() - startTime, req, res)
                }
                originalEnd.apply(res, args as any)
            })
        }

        next()
    }
}

function sourcegraphProxyReqHandler(
    variant: 'enterprise' | 'dotcom',
    config: MitMProxy
): ProxyReqHandler {
    return (proxyReq, req, res, options) => {
        if (config.sourcegraph[variant].proxyTarget.startsWith((options.target as URL).origin)) {
            const name = `sourcegraph.${variant}`
            proxyReq.setHeader('accept-encoding', 'identity') //makes it easier to debug
            proxyReq.setHeader(MITM_PROXY_SERVICE_ENDPOINT_HEADER, config.sourcegraph[variant].endpoint)
            proxyReq.setHeader(MITM_PROXY_SERVICE_NAME_HEADER, name)
            if (TESTING_CREDENTIALS[config.sourcegraph[variant].authName].token) {
                proxyReq.setHeader(MITM_PROXY_AUTH_AVAILABLE_HEADER, name)
            }
            const authReplacement =
                TESTING_CREDENTIALS[config.sourcegraph[variant].authName].token ??
                TESTING_CREDENTIALS[config.sourcegraph[variant].authName].redactedToken

            const headers = proxyReq.getHeaders()
            if (headers.authorization) {
                // can be used to match without worrying about the specific token value
                const before = getFirstOrValue(headers.authorization)
                const after = before.replace(MITM_AUTH_TOKEN_PLACEHOLDER, authReplacement)
                if (before !== after) {
                    // this means we set the token. This allows you to still
                    // manually specify some other token in your test. For
                    // instance to try and see what happens with an incorrect
                    // token
                    proxyReq.setHeader(MITM_PROXY_AUTH_TOKEN_NAME_HEADER, name)
                }

                proxyReq.setHeader('authorization', after)
            }
            return true
        }
        return false
    }
}

/**
 * Any function that resolves once the delay is over. Compatible with @pollyjs/core Timing
 */
export type ResponseDelayFn = (
    currentResponseTime: number,
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>
) => Promise<void>

export const floorResponseDelayFn =
    (floor: number) => async (currentResponseTime: number, req: IncomingMessage) => {
        if (currentResponseTime < floor) {
            await setPromiseTimeout(floor - currentResponseTime)
        }
    }
// TODO: fuzzy/random responseDelayFn

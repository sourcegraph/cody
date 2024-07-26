import { test as _test } from '@playwright/test'
import { Polly, Timing } from '@pollyjs/core'
import jsonStableStringify from 'fast-json-stable-stringify'
import 'node:http'
import 'node:https'
import path from 'node:path'
import type { TestContext, WorkerContext } from '.'
import { redactAuthorizationHeader } from '../../../../src/testutils/CodyPersisterV2'
import { CODY_VSCODE_ROOT_DIR } from '../../helpers'
import {
    MITM_PROXY_AUTH_AVAILABLE_HEADER,
    MITM_PROXY_AUTH_TOKEN_NAME_HEADER,
    MITM_PROXY_SERVICE_NAME_HEADER,
} from '../constants'
import { getFirstOrValue } from './util'

export const pollyFixture = _test.extend<TestContext, WorkerContext>({
    polly: [
        async ({ validOptions }, use, testInfo) => {
            const relativeTestPath = path.relative(
                path.resolve(CODY_VSCODE_ROOT_DIR, testInfo.project.testDir),
                testInfo.file
            )
            const polly = new Polly(`${testInfo.project.name}/${relativeTestPath}/${testInfo.title}`, {
                flushRequestsOnStop: true,
                recordIfMissing: validOptions.recordIfMissing ?? validOptions.recordingMode === 'record',
                mode: validOptions.recordingMode,
                persister: 'fs',
                adapters: ['node-http'],
                recordFailedRequests: true,
                logLevel: 'SILENT',
                timing: Timing.fixed(0), //TODO: Configuration for fuzzy/flake testing
                matchRequestsBy: {
                    //TODO: Think of a clever way that we can require order on some types of requests
                    order: false,
                    method: true,
                    url(url, req) {
                        const parsed = new URL(url)
                        parsed.searchParams.delete('client-version')
                        const mitmProxy = getFirstOrValue(req.headers[MITM_PROXY_SERVICE_NAME_HEADER])
                        if (mitmProxy) {
                            parsed.hostname = `${mitmProxy}.proxy`
                            parsed.port = ''
                            parsed.protocol = 'http:'
                        }
                        //todo: replace host with semantic name if available
                        return parsed.toString()
                    },
                    // Canonicalize JSON bodies so that we can replay the recording even if the JSON strings
                    // differ by semantically meaningless things like object key enumeration order.
                    body(body, req) {
                        const contentType = getFirstOrValue(req.getHeader('content-type'))?.toLowerCase()
                        if (contentType === 'application/json') {
                            return jsonStableStringify(JSON.parse(body))
                        }
                        //TODO: Remove client version variables
                        if (!contentType && typeof body === 'string') {
                            const trimmedBody = body.trim()
                            if (
                                (trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) ||
                                (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))
                            ) {
                                let json: any = null
                                try {
                                    //only allow this to fail silently
                                    json = JSON.parse(trimmedBody)
                                } catch {}
                                return jsonStableStringify(json)
                            }
                        }
                        // TODO: We want to handle site identification requests so that we can seamlessly switch proxied backends
                        // these are base64, chunked, gzip encoded responses though so we'll get to that
                        return body
                    },
                    headers(headers, req) {
                        const matchHeaders: Record<string, string> = {}
                        const auth = getFirstOrValue(headers.authorization)
                        const authName = getFirstOrValue(headers[MITM_PROXY_AUTH_TOKEN_NAME_HEADER])
                        if (authName) {
                            matchHeaders[MITM_PROXY_AUTH_TOKEN_NAME_HEADER] = authName
                        } else if (auth) {
                            matchHeaders.authorization = redactAuthorizationHeader(auth)
                        }

                        return matchHeaders
                    },
                },
                persisterOptions: {
                    keepUnusedRequests: validOptions.keepUnusedRecordings ?? true,
                    fs: {
                        recordingsDir: path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.recordingDir),
                    },
                },
            })

            polly.server
                .any()
                .filter(req => !req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))
                .passthrough()

            //TODO(rnauta): we probably make some helpers so that we can verify it's a proxy request from a particular service
            // Sourcegraph Handlers
            polly.server
                .any()
                .filter(req => {
                    return !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                        'sourcegraph'
                    )
                })
                .on('response', (req, res) => {
                    if (res.statusCode === 401) {
                        // check if we simply didn't have the correct auth available
                        const authAvailable = req.hasHeader(MITM_PROXY_AUTH_AVAILABLE_HEADER)
                        const authSet = req.hasHeader(MITM_PROXY_AUTH_TOKEN_NAME_HEADER)

                        if (authSet && !authAvailable) {
                            throw new Error(
                                "TESTING_CREDENTIALS haven't been set. TODO: Give an action to run next"
                            )
                        }
                    }
                })

            if (true as unknown) {
                // TODO: Make it configurable if we setup default handlers
                polly.server
                    .any()
                    .filter(req => {
                        return (
                            !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                                'sourcegraph'
                            ) && req.pathname.startsWith('/-/debug/otlp/v1/traces')
                        )
                    })
                    .intercept((req, res) => {
                        //TODO(rnauta): forward this to a local otlp server & include with attachments
                        // ideally combined with local or even remote sourcegraph traces too
                        res.status(201).json({ partialSuccess: {} })
                    })

                polly.server
                    .any()
                    .filter(req => {
                        return (
                            !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                                'sourcegraph'
                            ) &&
                            req.pathname.startsWith('/.api/graphql') &&
                            'LogEventMutation' in req.query
                        )
                    })
                    .intercept((req, res) => {
                        //TODO: Implement this
                        res.status(200).json({ data: { logEvent: null } })
                    })

                polly.server
                    .any()
                    .filter(req => {
                        return (
                            !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                                'sourcegraph'
                            ) &&
                            req.pathname.startsWith('/.api/graphql') &&
                            'RecordTelemetryEvents' in req.query
                        )
                    })
                    .intercept((req, res) => {
                        //TODO: implement this
                        res.status(200).json({
                            data: { telemetry: { recordEvents: { alwaysNil: null } } },
                        })
                    })

                polly.server
                    .any()
                    .filter(req => {
                        return (
                            !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                                'sourcegraph'
                            ) &&
                            req.pathname.startsWith('/.api/graphql') &&
                            'EvaluateFeatureFlag' in req.query
                        )
                    })
                    .intercept((req, res) => {
                        //TODO(rnauta): impeement this
                        res.status(200).json({ data: { evaluateFeatureFlag: null } })
                    })
                polly.server
                    .any()
                    .filter(req => {
                        return (
                            !!getFirstOrValue(req.getHeader(MITM_PROXY_SERVICE_NAME_HEADER))?.startsWith(
                                'sourcegraph'
                            ) &&
                            req.pathname.startsWith('/.api/graphql') &&
                            'FeatureFlags' in req.query
                        )
                    })
                    .intercept((req, res) => {
                        //TODO: implement this
                        res.status(200).json({ data: { evaluatedFeatureFlags: [] } })
                    })

                polly.server
                    .any()
                    .filter(req => {
                        return req.pathname.startsWith('/healthz')
                    })
                    .intercept((req, res, interceptor) => {
                        //TODO: implement this
                        res.sendStatus(200)
                    })
            }

            await use(polly)
            //NOTE: Be careful where you include Polly in this fixture. Because
            //right now it's one of the first things released after a test
            //meaning that requests outside of the test (such as shutting down
            //etc) are not recorded/intercepted. If you'd include it in a
            //component that lives longer the cleanup might not happen directly
            //after the test finishes
            await polly.stop()
        },
        { scope: 'test' },
    ],
})

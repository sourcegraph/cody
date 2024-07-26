// TODO/WARNING/APOLOGY: I know that this is an unreasonably large file right
// now. I'll refactor and cut it down this down once everything is working
// first.
import { spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import 'node:http'
import 'node:https'
import type { Server as HTTPServer } from 'node:http'
import path from 'node:path'
import { EventEmitter } from 'node:stream'
import { setTimeout } from 'node:timers/promises'
import pspawn from '@npmcli/promise-spawn'
import { test as _test, expect, mergeTests } from '@playwright/test'
import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import { type EXPIRY_STRATEGY, type MODE, Polly, Timing } from '@pollyjs/core'
import type { ArrayContainsAll } from '@sourcegraph/cody-shared/src/utils'
import {
    ConsoleReporter,
    type ProgressReport,
    ProgressReportStage,
    resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron'
import { downloadAndUnzipVSCode } from '@vscode/test-electron/out/download'
import express from 'express'
import jsonStableStringify from 'fast-json-stable-stringify'
import { copy as copyExt } from 'fs-extra'
import glob from 'glob'
import { createProxyMiddleware, proxyEventsPlugin } from 'http-proxy-middleware'
import type { OnProxyEvent } from 'http-proxy-middleware/dist/types'
import killSync from 'kill-sync'
import { onExit } from 'signal-exit'
import zod from 'zod'
import { waitForLock } from '../../../src/lockfile'
import { CodyPersister, redactAuthorizationHeader } from '../../../src/testutils/CodyPersisterV2'
import type {
    DOTCOM_TESTING_CREDENTIALS,
    ENTERPRISE_TESTING_CREDENTIALS,
} from '../../../src/testutils/testing-credentials'
import { TESTING_CREDENTIALS } from '../../../src/testutils/testing-credentials'
import { CODY_VSCODE_ROOT_DIR, retry, stretchTimeout } from '../helpers'

import {
    MITM_AUTH_TOKEN_PLACEHOLDER,
    MITM_PROXY_AUTH_AVAILABLE_HEADER,
    MITM_PROXY_AUTH_TOKEN_NAME_HEADER,
    MITM_PROXY_SERVICE_ENDPOINT_HEADER,
    MITM_PROXY_SERVICE_NAME_HEADER,
} from './constants'
type Directory = string

const DOWNLOAD_GRACE_TIME = 5 * 60 * 1000 //5 minutes

// TODO(rnauta): finish all variable descriptions
const zAbsPath = () => zod.string().transform(p => path.resolve(CODY_VSCODE_ROOT_DIR, p))
const workerOptionsSchema = zod.object({
    repoRootDir: zAbsPath().describe(
        'DEPRECATED: The .git root of this project. Might still get used for some path defaults so must be set'
    ),
    vscodeExtensionCacheDir: zAbsPath(),
    globalTmpDir: zAbsPath(),
    vscodeTmpDir: zAbsPath(),
    vscodeServerTmpDir: zAbsPath(),
    binaryTmpDir: zAbsPath(),
    recordingDir: zAbsPath(),
    vscodeServerPortRange: zod.tuple([zod.number(), zod.number()]).default([33100, 33200]),
    mitmServerPortRange: zod.tuple([zod.number(), zod.number()]).default([34100, 34200]),
    keepRuntimeDirs: zod.enum(['all', 'failed', 'none']).default('none'),
    allowGlobalVSCodeModification: zod.boolean().default(false),
    waitForExtensionHostDebugger: zod.boolean().default(false),
})

const testOptionsSchema = zod.object({
    vscodeVersion: zod.string().default('stable'),
    vscodeExtensions: zod.array(zod.string().toLowerCase()).default([]),
    templateWorkspaceDir: zAbsPath(),
    recordingMode: zod.enum([
        'passthrough',
        'record',
        'replay',
        'stopped',
    ] satisfies ArrayContainsAll<MODE>),
    recordIfMissing: zod.boolean(),
    keepUnusedRecordings: zod.boolean().default(true),
    recordingExpiryStrategy: zod
        .enum(['record', 'warn', 'error'] satisfies ArrayContainsAll<EXPIRY_STRATEGY>)
        .default('record'),
    recordingExpiresIn: zod.string().nullable().default(null),
})

export type TestOptions = zod.infer<typeof testOptionsSchema>
export type WorkerOptions = zod.infer<typeof workerOptionsSchema>

interface MitMProxyConfig {
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
}

export interface WorkerContext {
    validWorkerOptions: WorkerOptions
    debugMode: boolean
}

export interface TestContext {
    vscodeUI: {
        url: string
        token: string
        extensionHostDebugPort: number | null
    }
    serverRootDir: Directory
    validOptions: TestOptions & WorkerOptions
    polly: Polly
    mitmProxy: MitMProxyConfig
    //sourcegraphMitM: { endpoint: string; target: string }
    workspaceDir: Directory
    //TODO(rnauta): Make the typing inferred from VSCode directly
    executeCommand: <T = any>(commandId: string, ...args: any[]) => Promise<T | undefined>
}

type ProxyReqHandler = (...args: Parameters<Exclude<OnProxyEvent['proxyReq'], undefined>>) => boolean

function schemaOptions<T extends zod.ZodObject<any>, S extends 'worker' | 'test'>(o: T, s: S) {
    return Object.fromEntries(
        Object.keys(o.shape).map(key => [key, [undefined, { scope: s, option: true }]])
    ) as unknown as { [k in keyof T]: [T[k], { scope: S; option: true }] }
}

const SPAWNED_PIDS = new Set<number | undefined>()
onExit(
    () => {
        for (const pid of SPAWNED_PIDS.values()) {
            if (pid !== undefined) {
                killSync(pid, 'SIGKILL', true)
            }
        }
    },
    { alwaysLast: true }
)

// We split out the options fixutre from the implementation fixture so that in
// the implementaiton fixture we don't accidentally use any options directly,
// instead having to use validated options
const optionsFixture: ReturnType<
    typeof _test.extend<Pick<TestContext, 'validOptions'>, Pick<WorkerContext, 'validWorkerOptions'>>
> = _test.extend<
    TestOptions & Pick<TestContext, 'validOptions'>,
    WorkerOptions & Pick<WorkerContext, 'validWorkerOptions'>
>({
    ...schemaOptions(workerOptionsSchema, 'worker'),
    ...schemaOptions(testOptionsSchema, 'test'),
    validWorkerOptions: [
        async (
            {
                repoRootDir,
                binaryTmpDir,
                recordingDir,
                globalTmpDir,
                vscodeTmpDir,
                vscodeServerTmpDir,
                vscodeExtensionCacheDir,
                keepRuntimeDirs,
                vscodeServerPortRange,
                mitmServerPortRange,
                allowGlobalVSCodeModification,
                waitForExtensionHostDebugger,
            },
            use
        ) => {
            const validOptionsWithDefaults = await workerOptionsSchema.safeParseAsync(
                {
                    repoRootDir,
                    binaryTmpDir,
                    recordingDir,
                    globalTmpDir,
                    vscodeTmpDir,
                    vscodeServerTmpDir,
                    vscodeExtensionCacheDir,
                    keepRuntimeDirs,
                    vscodeServerPortRange,
                    mitmServerPortRange,
                    allowGlobalVSCodeModification,
                    waitForExtensionHostDebugger,
                } satisfies { [key in keyof WorkerOptions]-?: WorkerOptions[key] },
                {}
            )
            if (!validOptionsWithDefaults.success) {
                throw new TypeError(
                    `Invalid worker arguments:\n${JSON.stringify(
                        validOptionsWithDefaults.error.flatten().fieldErrors,
                        null,
                        2
                    )}`
                )
            }
            use(validOptionsWithDefaults.data)
        },
        { scope: 'worker', auto: true },
    ],
    validOptions: [
        async (
            {
                vscodeExtensions,
                vscodeVersion,
                templateWorkspaceDir,
                recordIfMissing,
                recordingMode,
                keepUnusedRecordings,
                recordingExpiresIn,
                recordingExpiryStrategy,
                validWorkerOptions,
            },
            use
        ) => {
            const validOptionsWithDefaults = await testOptionsSchema.safeParseAsync(
                {
                    vscodeExtensions,
                    vscodeVersion,
                    keepUnusedRecordings,
                    recordingExpiresIn,
                    recordingExpiryStrategy,
                    templateWorkspaceDir,
                    recordIfMissing,
                    recordingMode,
                } satisfies { [key in keyof TestOptions]-?: TestOptions[key] },
                {}
            )
            if (!validOptionsWithDefaults.success) {
                throw new TypeError(
                    `Invalid test arguments:\n${JSON.stringify(
                        validOptionsWithDefaults.error.flatten().fieldErrors,
                        null,
                        2
                    )}`
                )
            }
            use({ ...validOptionsWithDefaults.data, ...validWorkerOptions })
        },
        { scope: 'test', auto: true },
    ],
})

const debugFixture = _test.extend<TestContext, WorkerContext>({
    debugMode: [
        async ({ browser }, use, testInfo) => {
            use(!!process.env.PWDEBUG)
        },
        { scope: 'worker' },
    ],
})

const implFixture = _test.extend<TestContext, WorkerContext>({
    serverRootDir: [
        async ({ validWorkerOptions }, use, testInfo) => {
            const dir = await fs.mkdtemp(
                path.resolve(validWorkerOptions.globalTmpDir, 'test-vscode-server-')
            )
            await use(dir)
            const attachmentPromises = []
            const logDir = path.join(dir, 'data/logs')

            for (const file of await getFilesRecursive(logDir)) {
                const filePath = path.join(file.path, file.name)
                const relativePath = path.relative(logDir, filePath)
                attachmentPromises.push(
                    testInfo.attach(relativePath, {
                        path: filePath,
                    })
                )
            }
            if (attachmentPromises.length > 0) {
                await Promise.allSettled(attachmentPromises)
            }
            if (
                validWorkerOptions.keepRuntimeDirs === 'none' ||
                (validWorkerOptions.keepRuntimeDirs === 'failed' &&
                    ['failed', 'timedOut'].includes(testInfo.status ?? 'unknown'))
            ) {
                await retry(() => fs.rm(logDir, { force: true, recursive: true }), 20, 500)
            }
        },
        { scope: 'test' },
    ],
    workspaceDir: [
        async ({ validOptions }, use, testInfo) => {
            const dir = await fs.mkdtemp(path.resolve(validOptions.globalTmpDir, 'test-workspace-'))

            await copyExt(path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.templateWorkspaceDir), dir, {
                overwrite: true,
                preserveTimestamps: true,
                dereference: true, // we can't risk the test modifying the symlink
            })
            await use(dir)
            if (
                validOptions.keepRuntimeDirs === 'none' ||
                (validOptions.keepRuntimeDirs === 'failed' &&
                    ['failed', 'timedOut'].includes(testInfo.status ?? 'unknown'))
            ) {
                await retry(() => fs.rm(dir, { force: true, recursive: true }), 20, 500)
            }
        },
        {
            scope: 'test',
        },
    ],
    //#region Polly & Proxies
    mitmProxy: [
        async ({ validWorkerOptions }, use, testInfo) => {
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
            //TODO: we can provide additional endpoints here
            const state: {
                authName: {
                    enterprise: MitMProxyConfig['sourcegraph']['enterprise']['authName']
                    dotcom: MitMProxyConfig['sourcegraph']['dotcom']['authName']
                }
            } = { authName: { enterprise: 's2', dotcom: 'dotcom' } }

            const config: MitMProxyConfig = {
                sourcegraph: {
                    dotcom: {
                        get authName() {
                            return state.authName.dotcom
                        },
                        set authName(value: MitMProxyConfig['sourcegraph']['dotcom']['authName']) {
                            state.authName.dotcom = value
                        },
                        endpoint: `http://127.0.0.1:${sgEnterprisePort}`,
                        get proxyTarget() {
                            return TESTING_CREDENTIALS[state.authName.dotcom].serverEndpoint
                        },
                    },
                    enterprise: {
                        get authName() {
                            return state.authName.enterprise
                        },
                        set authName(value: MitMProxyConfig['sourcegraph']['enterprise']['authName']) {
                            state.authName.enterprise = value
                        },
                        endpoint: `http://127.0.0.1:${sgDotComPort}`,
                        get proxyTarget() {
                            return TESTING_CREDENTIALS[state.authName.enterprise].serverEndpoint
                        },
                    },
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
            app.use(proxyMiddleware)
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
                timing: Timing.relative(1.0), //TODO: Configuration for fuzzy/flake testing
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
    //#region vscode agent
    vscodeUI: [
        async ({ validOptions, debugMode, serverRootDir, mitmProxy, page, polly }, use, testInfo) => {
            polly.pause()

            const executableDir = path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.vscodeTmpDir)
            await fs.mkdir(executableDir, { recursive: true })
            const serverExecutableDir = path.resolve(
                CODY_VSCODE_ROOT_DIR,
                validOptions.vscodeServerTmpDir
            )
            await fs.mkdir(serverExecutableDir, { recursive: true })
            // We nullify the time it takes to download VSCode as it can vary wildly!
            const [_, codeTunnelCliPath] = await stretchTimeout(
                () => downloadOrWaitForVSCode({ validOptions, executableDir }),
                {
                    max: DOWNLOAD_GRACE_TIME,
                    testInfo,
                }
            )

            // Machine settings should simply serve as a baseline to ensure
            // tests by default work smoothly. Any test specific preferences
            // should be set in workspace settings instead.

            // Note: Not all settings can be set as machine settings, especially
            // those with security implications. These are set as user settings
            // which live inside the browser's IndexDB. There's
            const machineDir = path.join(serverRootDir, 'data/Machine')
            await fs.mkdir(machineDir, { recursive: true })
            await fs.writeFile(
                path.join(machineDir, 'settings.json'),
                JSON.stringify(
                    {
                        'extensions.ignoreRecommendations': true,
                        'workbench.editor.empty.hint': 'hidden',
                        'workbench.startupEditor': 'none',
                        'workbench.tips.enabled': false,
                        'workbench.welcomePage.walkthroughs.openOnInstall': false,
                        'workbench.colorTheme': 'Default Dark Modern',
                        // sane defaults
                        'cody.debug.verbose': false,
                    },
                    null,
                    2
                )
            )

            // Here we install the extensions requested. To speed things up we make use of a shared extension cache that we symlink to.
            const extensionsDir = path.join(serverRootDir, 'extensions')
            await fs.mkdir(extensionsDir, { recursive: true })
            const userDataDir = path.join(serverRootDir, 'data/User')
            await fs.mkdir(userDataDir, { recursive: true })
            if (validOptions.vscodeExtensions.length > 0) {
                //TODO(rnauta): Add lockfile wrapper to avoid race conditions
                const sharedExtensionsDir = path.resolve(
                    CODY_VSCODE_ROOT_DIR,
                    validOptions.vscodeExtensionCacheDir
                )
                if (!sharedExtensionsDir.endsWith(path.join('.vscode-server', 'extensions'))) {
                    //right now there's no way of setting the extension installation directory. Instead they are always install in ~/.vscode-server/extensions
                    throw new Error(
                        "Unfortunately VSCode doesn't provide a way yet to cache extensions isolated from a global installation. Please use ~/.code-server/extensions for now."
                    )
                }
                await fs.mkdir(sharedExtensionsDir, { recursive: true })
                const releaseLock = await waitForLock(sharedExtensionsDir, {
                    lockfilePath: path.join(sharedExtensionsDir, '.lock'),
                    delay: 1000,
                })
                try {
                    const args = [
                        ...validOptions.vscodeExtensions.flatMap(v => ['--install-extension', v]),
                    ]
                    await pspawn(codeTunnelCliPath, args, {
                        env: {
                            ...process.env,
                            // VSCODE_EXTENSIONS: sharedExtensionsDir, This doesn't work either
                        },
                        stdio: ['inherit', 'ignore', 'inherit'],
                    })
                } finally {
                    releaseLock()
                }
                //we now read all the folders in the shared cache dir and
                //symlink the relevant ones to our isolated extension dir
                for (const sharedExtensionDir of await fs.readdir(sharedExtensionsDir)) {
                    const [_, extensionName] = /^(.*)-\d+\.\d+\.\d+$/.exec(sharedExtensionDir) ?? []
                    if (!validOptions.vscodeExtensions.includes(extensionName?.toLowerCase())) {
                        continue
                    }
                    const sharedExtensionPath = path.join(sharedExtensionsDir, sharedExtensionDir)
                    const extensionPath = path.join(extensionsDir, sharedExtensionDir)
                    await fs.symlink(sharedExtensionPath, extensionPath)
                }
            }
            //TODO: Fixed Port Ranges

            // We can now start the server
            const connectionToken = '0000-0000'
            const [serverPort, reservedExtensionHostDebugPort] = rangeOffset(
                [testInfo.parallelIndex * 2, 2],
                validOptions.vscodeServerPortRange
            )
            const args = [
                'serve-web',
                `--user-data-dir=${userDataDir}`,
                '--accept-server-license-terms',
                `--port=${serverPort}`,
                `--connection-token=${connectionToken}`,
                `--cli-data-dir=${serverExecutableDir}`,
                `--server-data-dir=${serverRootDir}`,
                `--extensions-dir=${extensionsDir}`, // cli doesn't handle quotes properly so just escape spaces,
            ]

            const extensionHostDebugPort = debugMode ? reservedExtensionHostDebugPort : null
            const env = {
                ...process.env,
                ...(['stable', 'insiders'].includes(validOptions.vscodeVersion)
                    ? { VSCODE_CLI_QUALITY: validOptions.vscodeVersion }
                    : { VSCODE_CLI_COMMIT: validOptions.vscodeVersion }),
                // This environment variable is read inside the patched server.main.js of VSCode server
                EXTENSION_HOST_INSPECT_ENV: validOptions.waitForExtensionHostDebugger
                    ? `--inspect-brk=${extensionHostDebugPort}`
                    : `--inspect=${extensionHostDebugPort}`,
                TESTING_DOTCOM_URL: mitmProxy.sourcegraph.dotcom.endpoint,
                CODY_TESTING_BFG_DIR: path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.binaryTmpDir),
                CODY_TESTING_SYMF_DIR: path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.binaryTmpDir),
            }
            const config = {
                url: `http://127.0.0.1:${serverPort}/`,
                token: connectionToken,
                extensionHostDebugPort,
            }

            const codeProcess = await stretchTimeout(
                () =>
                    waitForPatchedVSCodeServer({
                        codeTunnelCliPath,
                        args,
                        env,
                        url: config.url,
                        serverExecutableDir,
                    }),
                {
                    max: DOWNLOAD_GRACE_TIME,
                    testInfo,
                }
            )

            polly.play()

            await use(config)

            polly.pause()
            // Turn of logging browser logging and navigate away from the UI
            // Otherwise we needlessly add a bunch of noisy error logs
            if (page.url().startsWith(config.url)) {
                await page.evaluate(() => {
                    console.log = () => {}
                    console.info = () => {}
                    console.warn = () => {}
                    console.error = () => {}
                    window.onerror = () => {}
                })
                await page.goto('about:blank')
                await page.waitForLoadState('domcontentloaded')
            }
            if (codeProcess.pid) {
                killSync(codeProcess.pid, 'SIGTERM', true)
                SPAWNED_PIDS.delete(codeProcess.pid)
            }
        },
        { scope: 'test' },
    ],
    // This exposes some bare-bones VSCode APIs in the browser context. You can
    // now simply execute a command from the chrome debugger which is a lot less
    // flaky then relying on Button Clicks etc.
    executeCommand: [
        async ({ page }, use) => {
            const commandFn = async (command: string, ...args: any[]): Promise<any> => {
                return await _test.step(
                    'executeCommand',
                    async () => {
                        await expect(page.locator('meta[name="__exposed-vscode-api__"]')).toBeAttached({
                            timeout: 4000,
                        })
                        const res = await page.evaluate(
                            async ({ command, args }) => {
                                //@ts-ignore
                                return await window._executeCommand(command, ...args)
                            },
                            {
                                command,
                                args,
                            }
                        )
                        return res
                    },
                    { box: true }
                )
            }
            use(commandFn)
        },
        { scope: 'test' },
    ],
})

export const fixture = mergeTests(optionsFixture, debugFixture, implFixture) as ReturnType<
    typeof _test.extend<TestContext & TestOptions, WorkerContext & WorkerOptions>
>

fixture.beforeAll(async () => {
    // This just registers polly adapters, it doesn't actually wire anything up
    await fixture.step('Polly Register', () => {
        Polly.register(NodeHttpAdapter)
        Polly.register(CodyPersister)
    })
})

/**
 * Waits for server components to be downloaded, patched (so that we can control
 * the debug port) and that the server is ready to accept connections
 */
async function waitForPatchedVSCodeServer(config: {
    url: string
    codeTunnelCliPath: string
    args: string[]
    env: Record<string, string>
    serverExecutableDir: string
    maxConnectionRetries?: number
}) {
    const releaseServerDownloadLock = await waitForLock(config.serverExecutableDir, {
        delay: 100,
        lockfilePath: path.join(config.serverExecutableDir, '.lock'),
    })
    try {
        while (true) {
            const filesToPatch = glob.sync(
                path.join(
                    config.serverExecutableDir,
                    'serve-web',
                    '*',
                    'out',
                    'vs',
                    'server',
                    'node',
                    'server.main.js'
                )
            )
            // We patch the server.main.js file to accept a environment variable
            // (EXTENSION_HOST_INSPECT_ENV) that allows us to control the debug port
            // of specifically the extension host. There is currently no offical
            // mechanism to do so in the serve-web command.
            let requiresPatching = false
            for (const file of filesToPatch) {
                const contents = await fs.readFile(file, 'utf-8')
                if (contents.includes('process.env.EXTENSION_HOST_INSPECT_ENV')) {
                    //this file is assumed already patched
                    continue
                }
                requiresPatching = true
                // this is a bit tricky to understand, but essentially we find
                // `C.execArgv.unshift("--dns-result-order=ipv4first")` which is the
                // insertion point. The `C` here might change depending on the
                // minifier so we capture this variable and then re-use it in our
                // injected statement.
                // process.env.EXTENSION_HOST_INSPECT_ENV ? C.execArgv.push(process.env.EXTENSION_HOST_INSPECT_ENV) : null;C.execArgv.unshift("--dns-result-order=ipv4first")
                const insertionPoint =
                    /(?<varname>[A-Z]+)\.execArgv\.unshift\("--dns-result-order=ipv4first"\)/.exec(
                        contents
                    )
                if (!insertionPoint) {
                    throw new Error(`Could not find insertion point for patching ${file}`)
                }
                const varname = insertionPoint?.groups?.varname
                if (!varname) {
                    throw new Error(
                        `Could not find variable name for insertion point for patching ${file}`
                    )
                }
                //we split at the insertion point
                const newContent =
                    contents.slice(0, insertionPoint.index) +
                    `process.env.EXTENSION_HOST_INSPECT_ENV ? ${varname}.execArgv.push(process.env.EXTENSION_HOST_INSPECT_ENV) : null;` +
                    contents.slice(insertionPoint.index)
                await fs.writeFile(file, newContent, 'utf-8')
            }
            if (requiresPatching) {
                // we retry even before starting the server. This is because if the patch changes we might need to re-patch already existing server downloads
                continue
            }
            const codeProcess = spawn(config.codeTunnelCliPath, config.args, {
                env: config.env,
                stdio: ['inherit', 'ignore', 'inherit'],
                detached: false,
            })
            SPAWNED_PIDS.add(codeProcess.pid)

            let connectionIssueTries = config.maxConnectionRetries ?? 5
            while (true) {
                try {
                    const res = await fetch(config.url)
                    if (res.status === 202) {
                        requiresPatching = true
                        // we are still downloading here
                    } else if (res.status === 200 || res.status === 403) {
                        // 403 simply means we haven't supplied the token
                        // 200 probably means we didn't require a token
                        // either way we are ready to accept connections
                        break
                    } else {
                        console.error(`Unexpected status code ${res.status}`)
                    }
                } catch (err) {
                    connectionIssueTries--
                    if (connectionIssueTries <= 0) {
                        throw err
                    }
                }
                await setTimeout(1000)
            }
            if (requiresPatching) {
                // We need to patch and restart the server so we kill this one and try again
                if (codeProcess.pid) {
                    killSync(codeProcess.pid, 'SIGTERM', true)
                    SPAWNED_PIDS.delete(codeProcess.pid)
                }
            } else {
                return codeProcess
            }
        }
    } finally {
        releaseServerDownloadLock()
    }
}

/**
 * This ensures only a single process is actually downloading VSCode
 */
async function downloadOrWaitForVSCode({
    executableDir,
    validOptions,
}: Pick<TestContext, 'validOptions'> & { executableDir: string }) {
    const lockfilePath = path.join(executableDir, '.lock')
    const releaseLock = await waitForLock(executableDir, { lockfilePath, delay: 500 })

    try {
        const electronPath = await downloadAndUnzipVSCode({
            cachePath: executableDir,
            version: 'stable',
            reporter: new CustomConsoleReporter(process.stdout.isTTY),
        })
        const installPath = path.join(
            executableDir,
            path.relative(executableDir, electronPath).split(path.sep)[0]
        )
        const [cliPath] = resolveCliArgsFromVSCodeExecutablePath(electronPath)
        //replce code with code-tunnel(.exe) either if the last binary or if code.exe
        const tunnelPath = cliPath
            .replace(/code$/, 'code-tunnel')
            .replace(/code\.(?:exe|cmd)$/, 'code-tunnel.exe')

        // we need to make sure vscode has global configuration set
        const res = await pspawn(tunnelPath, ['version', 'show'], {
            stdio: ['inherit', 'pipe', 'inherit'],
        })
        if (res.code !== 0 || res.stdout.includes('No existing installation found')) {
            if (!validOptions.allowGlobalVSCodeModification) {
                throw new Error('Global VSCode path modification is not allowed')
            }
            await pspawn(tunnelPath, ['version', 'use', 'stable', '--install-dir', installPath], {
                stdio: ['inherit', 'ignore', 'inherit'],
            })
        } else if (res.code !== 0) {
            throw new Error(JSON.stringify(res))
        }
        return [cliPath, tunnelPath]
        //If this fails I assume we haven't configured VSCode globally. Since
        //getting portable mode to work is annoying we just set this
        //installation as the global one.
    } finally {
        releaseLock()
    }
}

async function getFilesRecursive(dir: string): Promise<Array<Dirent>> {
    // lists all dirents recursively in a directory
    let dirs: Array<Promise<Array<Dirent>>> = [fs.readdir(dir, { withFileTypes: true })]
    const files: Array<Dirent> = []
    while (dirs.length > 0) {
        const ents = (await Promise.allSettled(dirs)).flat()
        dirs = []
        for (const promise of ents) {
            if (promise.status === 'rejected') {
                // we don't care, we just don't want to leave out other logs that did succeed
                continue
            }
            for (const ent of promise.value) {
                if (ent.isFile()) {
                    files.push(ent)
                } else if (ent.isDirectory()) {
                    dirs.push(fs.readdir(path.join(ent.path, ent.name), { withFileTypes: true }))
                }
            }
        }
    }
    return files
}

function sourcegraphProxyReqHandler(
    variant: 'enterprise' | 'dotcom',
    config: MitMProxyConfig
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

function getFirstOrValue<T>(input: T | Array<T>): T {
    return Array.isArray(input) ? input[0] : input
}

/**
 * Returns the lower bound + offset or errors if the number is outside of the range
 */
function rangeOffset<LENGTH extends number = number>(
    offset: [number, LENGTH],
    range: [number, number]
): FixedLengthTuple<number, LENGTH>
function rangeOffset(offset: number, range: [number, number]): number
function rangeOffset(_offset: number | [number, number], range: [number, number]): number | number[] {
    const [offset, take] = Array.isArray(_offset) ? _offset : [_offset, -1]
    const anchor = range[0] + offset
    if (take < 0) {
        return anchor
    }
    return Array.from({ length: take }, (_, i) => anchor + i)
}

type FixedLengthTuple<T, N extends number, R extends readonly T[] = []> = R['length'] extends N
    ? R
    : FixedLengthTuple<T, N, readonly [T, ...R]>

// A custom version of the VS Code download reporter that silences matching installation
// notifications as these otherwise are emitted on every test run
class CustomConsoleReporter extends ConsoleReporter {
    public report(report: ProgressReport): void {
        if (report.stage !== ProgressReportStage.FoundMatchingInstall) {
            super.report(report)
        }
    }
}

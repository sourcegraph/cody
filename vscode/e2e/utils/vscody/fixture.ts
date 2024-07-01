import { type StdioOptions, exec as _exec, spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import 'node:http'
import 'node:https'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import pspawn from '@npmcli/promise-spawn'
import { test as _test, expect, mergeTests } from '@playwright/test'
import NodeHttpAdapter from '@pollyjs/adapter-node-http'
import { type EXPIRY_STRATEGY, type MODE, Polly } from '@pollyjs/core'
import type { ArrayContainsAll } from '@sourcegraph/cody-shared/src/utils'
import { ConsoleReporter, type ProgressReport, ProgressReportStage } from '@vscode/test-electron'
import { downloadAndUnzipVSCode } from '@vscode/test-electron/out/download'
import chokidar from 'chokidar'
import express from 'express'
import { copy as copyExt } from 'fs-extra'
import { createProxyMiddleware } from 'http-proxy-middleware'
import zod from 'zod'

import { CodyPersister } from '../../../src/testutils/CodyPersister'
import { defaultMatchRequestsBy } from '../../../src/testutils/polly'
import { retry, stretchTimeout } from '../helpers'

const exec = promisify(_exec)

export type Directory = string

const DOWNLOAD_GRACE_TIME = 5 * 60 * 1000 //5 minutes

// TODO(rnauta): finish all variable descriptions
const workerOptionsSchema = zod.object({
    repoRootDir: zod
        .string()
        .describe(
            'DEPRECATED: The .git root of this project. Might still get used for some path defaults so must be set'
        ),
    vscodeExtensionCacheDir: zod.string(),
    vscodeTmpDir: zod.string(),
    binaryTmpDir: zod.string(),
    recordingDir: zod.string(),
})

const testOptionsSchema = zod.object({
    vscodeVersion: zod.string().default('stable'),
    vscodeExtensions: zod.array(zod.string()).default([]),
    templateWorkspaceDir: zod.string(),
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

export interface WorkerContext {
    validWorkerOptions: WorkerOptions
}
export interface TestContext {
    vscodeUI: {
        url: string
        token: string
    }
    serverRootDir: Directory
    validOptions: TestOptions & WorkerOptions
    polly: Polly
    sourcegraphMitM: { endpoint: string; target: string }
    workspaceDir: Directory
    //TODO(rnauta): Make the typing inferred from VSCode directly
    executeCommand: <T = any>(commandId: string, ...args: any[]) => Promise<T | undefined>
}

function schemaOptions<T extends zod.ZodObject<any>, S extends 'worker' | 'test'>(o: T, s: S) {
    return Object.fromEntries(
        Object.keys(o.shape).map(key => [key, [undefined, { scope: s, option: true }]])
    ) as unknown as { [k in keyof T]: [T[k], { scope: S; option: true }] }
}

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
            { repoRootDir, binaryTmpDir, recordingDir, vscodeTmpDir, vscodeExtensionCacheDir },
            use
        ) => {
            const validOptionsWithDefaults = await workerOptionsSchema.safeParseAsync(
                {
                    repoRootDir,
                    binaryTmpDir,
                    recordingDir,
                    vscodeTmpDir,
                    vscodeExtensionCacheDir,
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

const implFixture = _test.extend<TestContext, WorkerContext>({
    serverRootDir: [
        // biome-ignore lint/correctness/noEmptyPattern: <explanation>
        async ({}, use, testInfo) => {
            const dir = await fs.mkdtemp(path.resolve(os.tmpdir(), 'test-vscode-server-'))
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
            await retry(() => fs.rm(dir, { force: true, recursive: true }), 20, 500)
        },
        { scope: 'test' },
    ],
    workspaceDir: [
        async ({ validOptions }, use) => {
            const dir = await fs.mkdtemp(path.resolve(os.tmpdir(), 'test-workspace-'))

            await copyExt(path.resolve(process.cwd(), validOptions.templateWorkspaceDir), dir, {
                overwrite: true,
                preserveTimestamps: true,
                dereference: true, // we can't risk the test modifying the symlink
            })
            await use(dir)
            await retry(() => fs.rm(dir, { force: true, recursive: true }), 20, 500)
        },
        {
            scope: 'test',
        },
    ],
    //#region Polly & Proxies
    sourcegraphMitM: [
        // biome-ignore lint/correctness/noEmptyPattern: <explanation>
        async ({}, use) => {
            const app = express()
            //TODO: Credentials & Configuration TODO: I can see a use-case where
            //you can switch endpoints dynamically. For instance wanting to try
            //signing out of one and then signing into another. You could
            //probably do that already using env variables in the workspace
            //config but it's not a super smooth experience yet. If you run into
            //this please give me a ping so we can brainstorm.
            const target = 'https://sourcegraph.com'
            const middleware = createProxyMiddleware({
                target,
                changeOrigin: true,
            })
            app.use(middleware)
            let server: ReturnType<typeof app.listen> = null as any
            const serverInfo = await new Promise<AddressInfo>((resolve, reject) => {
                server = app.listen(0, '127.0.0.1', () => {
                    const address = server.address()
                    if (address === null || typeof address === 'string') {
                        reject('address is not a valid object')
                    } else {
                        resolve(address)
                    }
                })
            })

            await use({
                endpoint: `http://${serverInfo.address}:${serverInfo.port}`,
                target,
            })

            server.closeAllConnections()
            await new Promise(resolve => server.close(resolve))
        },
        { scope: 'test' },
    ],
    polly: [
        async ({ validOptions, sourcegraphMitM }, use, testInfo) => {
            const polly = new Polly(`${testInfo.project}`, {
                flushRequestsOnStop: true,
                recordIfMissing: validOptions.recordIfMissing ?? validOptions.recordingMode === 'record',
                mode: validOptions.recordingMode,
                persister: 'fs',
                adapters: ['node-http'],
                recordFailedRequests: true,
                matchRequestsBy: defaultMatchRequestsBy,
                persisterOptions: {
                    keepUnusedRequests: validOptions.keepUnusedRecordings ?? true,
                    fs: {
                        recordingsDir: path.resolve(process.cwd(), validOptions.recordingDir),
                    },
                },
            })

            polly.server
                .any()
                .filter(req => !req.url.startsWith(sourcegraphMitM.target))
                .intercept((req, res, interceptor) => {
                    interceptor.stopPropagation()
                    interceptor.passthrough()
                })
            polly.server.host(sourcegraphMitM.target, () => {
                polly.server
                    .post('/.api/graphql')
                    .filter(req => 'RecordTelemetryEvents' in req.query)
                    .on('request', (req, inter) => {
                        //TODO(rnauta): Store telemetry & allow for custom validation (if needed)
                    })

                // NOTE: this might seem counter intuitive that the user could
                // override these functions given that PollyJS calls them in the
                // order they were defined. However, these intercept handlers
                // don't work like normal middleware in that it's the first to
                // respond. Instead if you call sendStatus(400) in a subsequent
                // handler you change the resoponse. So although handlers are
                // called in the order they are defined, it's the last handler
                // to modify the response that actually dictates the response.
                // This took me ages to figure out, and feels like a terrible
                // API...why they didn't just go with normal well-understood
                // middleware API 🤷‍♂️
                polly.server
                    .post('/.api/graphql')
                    .filter(
                        req => 'RecordTelemetryEvents' in req.query || 'LogEventMutation' in req.query
                    )
                    .intercept((req, res, interceptor) => {
                        res.sendStatus(200)
                    })

                polly.server.get('/healthz').intercept((req, res, interceptor) => {
                    res.sendStatus(200)
                })
            })

            await use(polly)
            await polly.flush()
            await polly.stop()
        },
        { scope: 'test' },
    ],
    //#region vscode agent
    vscodeUI: [
        async ({ validOptions, serverRootDir, sourcegraphMitM, page, context }, use, testInfo) => {
            const executableDir = path.resolve(process.cwd(), validOptions.vscodeTmpDir)
            await fs.mkdir(executableDir, { recursive: true })

            // We nullify the time it takes to download VSCode as it can vary wildly!
            const electronExecutable = await stretchTimeout(
                async () => downloadOrWaitForVSCode({ validOptions, executableDir }),
                {
                    max: DOWNLOAD_GRACE_TIME,
                    testInfo,
                }
            )

            // The location of the executable is platform dependent, try the
            // first location that works.
            const vscodeExecutable = await Promise.any(
                [
                    '../Resources/app/bin', // darwin
                    'bin', // linux and windows
                ].map(async binPath => {
                    const cliExecutableDir = path.resolve(path.dirname(electronExecutable), binPath)

                    // find either a code or code.exe file
                    const vscodeExecutableName = (await fs.readdir(cliExecutableDir)).find(
                        file => file.endsWith('code-tunnel') || file.endsWith('code-tunnel.exe')
                    )
                    if (!vscodeExecutableName) {
                        throw new Error(`Could not find a vscode executable in ${cliExecutableDir}`)
                    }
                    return path.join(cliExecutableDir, vscodeExecutableName)
                })
            ).catch(async () => {
                throw new Error(
                    `Could not find a vscode executable under ${path.dirname(electronExecutable)}`
                )
            })

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
                        'cody.debug.verbose': true,
                    },
                    null,
                    2
                )
            )

            // code cli can complain it can't find a version. So explicitly set it the downloaded vscode to it.
            const cliDataDir = path.join(serverRootDir, 'cli')
            await fs.mkdir(cliDataDir, { recursive: true })
            const env = {
                // inherit environment
                ...process.env,
                VSCODE_CLI_DATA_DIR: cliDataDir,
                PATH: path.dirname(vscodeExecutable) + path.delimiter + process.env.PATH,
                //TODO: all env variables
                TESTING_DOTCOM_URL: sourcegraphMitM.endpoint,
            }
            await pspawn(
                vscodeExecutable,
                ['version', 'use', 'stable', '--install-dir', path.dirname(electronExecutable)],
                { env }
            )

            // Here we install the extensions requested. To speed things up we make use of a shared extension cache that we symlink to.
            const extensionsDir = path.join(serverRootDir, 'extensions')
            await fs.mkdir(extensionsDir, { recursive: true })

            if (validOptions.vscodeExtensions.length > 0) {
                //TODO(rnauta): Add lockfile wrapper to avoid race conditions
                const sharedCacheDir = path.resolve(process.cwd(), validOptions.vscodeExtensionCacheDir)
                const args = [
                    `--extensions-dir=${sharedCacheDir.replace(/ /g, '\\ ')}`, // cli doesn't handle quotes properly so just escape spaces,
                    '--install-extension',
                    ...validOptions.vscodeExtensions,
                ]
                const opts = {
                    env,
                    stdio: ['ignore', 'inherit', 'inherit'] as StdioOptions,
                }
                await pspawn(vscodeExecutable, args, opts)
                //we now read all the folders in the shared cache dir and
                //symlink the relevant ones to our isolated extension dir
                for (const sharedExtensionDir of await fs.readdir(sharedCacheDir)) {
                    const [_, extensionName] = /^(.*)-\d+\.\d+\.\d+$/.exec(sharedExtensionDir) ?? []
                    if (!validOptions.vscodeExtensions.includes(extensionName)) {
                        continue
                    }
                    const sharedExtensionPath = path.join(sharedCacheDir, sharedExtensionDir)
                    const extensionPath = path.join(extensionsDir, sharedExtensionDir)
                    await fs.symlink(sharedExtensionPath, extensionPath, 'dir')
                }
            }

            // We can now start the server
            const args = [
                'serve-web',
                '--accept-server-license-terms',
                '--port=0',
                `--server-data-dir=${serverRootDir.replace(/ /g, '\\ ')}`,
                `--extensions-dir=${extensionsDir.replace(/ /g, '\\ ')}`, // cli doesn't handle quotes properly so just escape spaces,
            ]
            //TODO(rnauta): better typing
            const codeProcess = spawn(vscodeExecutable, args, {
                env,
                stdio: ['inherit', 'pipe', 'pipe'],
                detached: false,
            })
            if (!codeProcess.pid) {
                throw new Error('Could not start code process')
            }
            const token = await waitForVSCodeUI(codeProcess.stdout)
            if (!token) {
                throw new Error("VSCode did't provide an auth token")
            }
            // We started vscode with port 0 which means a random port was
            // assigned. However VSCode still reports the port as 0 themselves,
            // so we need to do some magic to get the actual port.
            // TODO: this might not be very cross-platform
            const port = await getPortForPid(codeProcess.pid)

            const config = { url: `http://127.0.0.1:${port}/`, token: token }
            await use(config)

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
            const exitPromise = new Promise(resolve => {
                codeProcess.on('exit', () => {
                    resolve(void 0)
                })
            })
            codeProcess.kill()
            await exitPromise
        },
        { scope: 'test', timeout: 15 * 1000 },
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

export const fixture = mergeTests(optionsFixture, implFixture) as ReturnType<
    typeof _test.extend<TestContext & TestOptions, WorkerContext & WorkerOptions>
>

fixture.beforeAll(async () => {
    // This just registers polly adapters, it doesn't actually wire anything up
    await fixture.step('Polly Register', () => {
        Polly.register(NodeHttpAdapter)
        Polly.register(CodyPersister)
    })
})

function waitForVSCodeUI(stdout: NodeJS.ReadableStream): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        const listener = (data: Buffer) => {
            if (data.toString().includes('available at')) {
                clearTimeout(timeout)
                stdout.removeListener('data', listener)
                const [_, token] = /\?tkn=([a-zA-Z0-9-]+)/.exec(data.toString()) ?? []
                resolve(token)
            }
        }
        const timeout = setTimeout(() => {
            stdout.removeListener('data', listener)
            reject(new Error('Could not start code process'))
        }, 10_000 /*TODO(rnauta): make this configurable*/)
        stdout.on('data', listener)
    })
}

/**
 * This ensures only a single process is actually downloading VSCode
 */
async function downloadOrWaitForVSCode({
    executableDir,
    validOptions,
}: Pick<TestContext, 'validOptions'> & { executableDir: string }) {
    let electronExecutable = ''
    while (!electronExecutable) {
        const downloadLockFilePath = path.join(
            executableDir,
            `${process.env.RUN_ID}.${validOptions.vscodeVersion}.lock`.replace(/[^A-Za-z0-9-.]/g, '')
        )
        const createdLockFilePath = await createFileIfNotExists(downloadLockFilePath)
        if (!createdLockFilePath) {
            // Someone else is downloading, let's just wait for the file to no longer exist.
            const watcher = chokidar.watch(downloadLockFilePath)
            try {
                await Promise.all([
                    new Promise(resolve => {
                        watcher.on('unlink', resolve)
                        watcher.on('change', resolve)
                    }),
                    //the file might have been removed as we were starting the wathcer
                    fileExists(downloadLockFilePath).then(exists => {
                        if (!exists) {
                            throw new Error('Abort')
                        }
                    }),
                ])
            } catch {
            } finally {
                await watcher.close()
            }
            continue
        }
        try {
            electronExecutable = await downloadAndUnzipVSCode({
                cachePath: executableDir,
                version: validOptions.vscodeVersion,
                reporter: new CustomConsoleReporter(process.stdout.isTTY),
            })
        } finally {
            await fs.unlink(downloadLockFilePath)
        }
    }
    return electronExecutable
}

async function createFileIfNotExists(p: string): Promise<string | null> {
    const openFileHandle = await fs.open(p, 'wx').catch(err => {
        if (err.code === 'EEXIST') {
            return null
        }
        throw err
    })
    await openFileHandle?.close()
    return openFileHandle ? p : null
}

function fileExists(p: string): Promise<boolean> {
    return fs
        .stat(p)
        .then(s => {
            return s.isFile()
        })
        .catch(err => {
            if (err.code === 'ENOENT') {
                return false
            }
            throw err
        })
}

async function getPortForPid(pid: number): Promise<number> {
    const platform = process.platform
    let command: string

    switch (platform) {
        case 'win32':
            command = `netstat -ano | findstr ${pid}`
            break
        case 'darwin':
            // Use `lsof` with specific options for macOS
            command = `lsof -nP -i4TCP -a -p ${pid} | grep LISTEN`
            break
        case 'linux':
            command = `ss -tlnp | grep ${pid}`
            break
        default:
            throw new Error(`Unsupported platform: ${platform}`)
    }

    const { stdout } = await exec(command, { encoding: 'utf-8' })
    const lines = stdout.split('\n')
    for (const line of lines) {
        const match = line.match(/:(\d+)\s/)
        if (match?.[1]) {
            return Number.parseInt(match[1], 10)
        }
    }
    throw new Error(`No listening port found for PID ${pid}`)
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

// A custom version of the VS Code download reporter that silences matching installation
// notifications as these otherwise are emitted on every test run
class CustomConsoleReporter extends ConsoleReporter {
    public report(report: ProgressReport): void {
        if (report.stage !== ProgressReportStage.FoundMatchingInstall) {
            super.report(report)
        }
    }
}

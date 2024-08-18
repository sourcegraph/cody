import { spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import 'node:http'
import 'node:https'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import pspawn from '@npmcli/promise-spawn'
import { test as _test, expect } from '@playwright/test'
import {
    ConsoleReporter,
    type ProgressReport,
    ProgressReportStage,
    resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron'
import { downloadAndUnzipVSCode } from '@vscode/test-electron/out/download'
import glob from 'glob'
import 'node:http'
import 'node:https'
import { onExit } from 'signal-exit'
import symlinkDir from 'symlink-dir'
import type { TestContext, WorkerContext } from '.'
import { waitForLock } from '../../../../src/lockfile'
import { CODY_VSCODE_ROOT_DIR, retry, stretchTimeout } from '../../helpers'
import { killChildrenSync, killSync } from './kill'
import { rangeOffset } from './util'
const DOWNLOAD_GRACE_TIME = 5 * 60 * 1000 //5 minutes

onExit(
    () => {
        // kill all processes that are a child to my own process
        killChildrenSync(process.pid, 'SIGKILL')
    },
    { alwaysLast: true }
)

export const vscodeFixture = _test.extend<TestContext, WorkerContext>({
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
            const [codeCliPath, codeTunnelCliPath] = await stretchTimeout(
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

            // extensions sadly can't live in the Cody dir because it would mess
            // up pnpm node_module symlink references. Instead we create a tmpdir
            // and and save a symlink to it here for easy access
            // const isolatedExtensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vsc-extensions'))
            // const extensionsDir = isolatedExtensionsDir
            // console.log('extensionsDir', extensionsDir)
            const extensionsDir = path.join(serverRootDir, 'extensions')
            await fs.mkdir(extensionsDir, { recursive: true })
            const userDataDir = path.join(serverRootDir, 'data/User')
            await fs.mkdir(userDataDir, { recursive: true })

            await installExtensions({ validOptions, codeCliPath, extensionsDir, userDataDir })

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
            if (!page.isClosed && page.url().startsWith(config.url)) {
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
                }
            } else {
                return codeProcess
            }
        }
    } finally {
        releaseServerDownloadLock()
    }
}

async function installExtensions({
    codeCliPath,
    validOptions,
    extensionsDir,
}: Pick<TestContext, 'validOptions'> & {
    codeCliPath: string
    extensionsDir: string
    userDataDir: string
}) {
    // We start by installing all extensions to a shared cache dir. This speeds up tests without any risk of flake.

    const sharedExtensionsDir = path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.vscodeExtensionCacheDir)
    if (validOptions.vscodeExtensions.length) {
        await fs.mkdir(sharedExtensionsDir, { recursive: true })
        const releaseLock = await waitForLock(sharedExtensionsDir, {
            lockfilePath: path.join(sharedExtensionsDir, '.lock'),
            delay: 1000,
        })
        try {
            const args = [
                `--extensions-dir=${sharedExtensionsDir}`,
                ...validOptions.vscodeExtensions.map(extension => `--install-extension=${extension}`),
            ]
            await pspawn(codeCliPath, args, {
                env: {
                    ...process.env,
                },
                stdio: ['inherit', 'ignore', 'inherit'],
            })
        } finally {
            releaseLock()
        }
    }

    // Next, we link any symlinkExtensions directly to the test-server extensions
    // directory. These are always preferred to marketplace versions.
    const symlinkedExtensions: Record<string, string> = {}
    const symlinkExtension = [
        ...validOptions.symlinkExtensions,
        path.join(CODY_VSCODE_ROOT_DIR, 'e2e/utils/vscody/extension'),
    ]
    for (const entry of symlinkExtension) {
        const { name, publisher, version } = await readExtensionMetadata(entry)
        await symlinkDir(entry, path.join(extensionsDir, `${publisher}.${name}-${version}`))
        symlinkedExtensions[`${publisher}.${name}`] = version
    }

    //we now read all the folders in the shared cache dir and
    //symlink the relevant ones to our isolated extension dir
    for (const entry of await fs.readdir(sharedExtensionsDir)) {
        const [_, extensionName] = /^(.*)-\d+\.\d+\.\d+$/.exec(entry) ?? []
        if (
            !validOptions.vscodeExtensions.includes(extensionName?.toLowerCase()) ||
            symlinkedExtensions[extensionName]
        ) {
            continue
        }

        const existingPath = path.join(sharedExtensionsDir, entry)
        const newPath = path.join(extensionsDir, entry)
        await symlinkDir(existingPath, newPath)
    }

    // Finally by listing the extensions it generates a extensions.json file which ensures that when VSCode starts it doesn't trigger a reload.
    await pspawn(codeCliPath, [`--extensions-dir=${extensionsDir}`, '--list-extensions'], {
        env: {
            ...process.env,
        },
        stdio: ['inherit', 'ignore', 'inherit'],
    })
}

async function readExtensionMetadata(
    extensionDir: string
): Promise<{ publisher: string; name: string; version: string }> {
    const packageJsonPath = await fs.readFile(path.join(extensionDir, 'package.json'))
    const packageJson = JSON.parse(packageJsonPath.toString())
    const { publisher, name, version } = packageJson
    if (!publisher || !name || !version) {
        throw new TypeError(
            `package.json for extension ${extensionDir} must have publisher, name, and version`
        )
    }
    return { publisher, name, version }
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

// A custom version of the VS Code download reporter that silences matching installation
// notifications as these otherwise are emitted on every test run
class CustomConsoleReporter extends ConsoleReporter {
    public report(report: ProgressReport): void {
        if (report.stage !== ProgressReportStage.FoundMatchingInstall) {
            super.report(report)
        }
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

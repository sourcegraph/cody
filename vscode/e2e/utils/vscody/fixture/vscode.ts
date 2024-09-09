import { spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import szip from '7zip-min'
import pspawn from '@npmcli/promise-spawn'
import { test as _test } from '@playwright/test'
import { isWindows } from '@sourcegraph/cody-shared'
import { move } from 'fs-extra'
import 'node:http'
import 'node:https'
import os from 'node:os'
import path from 'node:path'
import { onExit } from 'signal-exit'
import symlinkDir from 'symlink-dir'
import type { TestContext, WorkerContext } from '.'
import { downloadFile } from '../../../../src/local-context/utils'
import { waitForLock } from '../../../../src/lockfile'
import { withTempDir } from '../../../../test/e2e/helpers'
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
            const versionedServerExecutableDir = await stretchTimeout(
                () =>
                    downloadVSCodeServer({
                        serverExecutableDir,
                        validOptions,
                    }),
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

            await stretchTimeout(
                () =>
                    installExtensions({
                        validOptions,
                        versionedServerExecutableDir,
                        extensionsDir,
                        userDataDir,
                    }),
                { max: DOWNLOAD_GRACE_TIME, testInfo }
            )

            // We can now start the server
            const connectionToken = '0000-0000'
            const [serverPort, reservedExtensionHostDebugPort] = rangeOffset(
                [testInfo.parallelIndex * 2, 2],
                validOptions.vscodeServerPortRange
            )
            const args = [
                `--user-data-dir=${userDataDir}`,
                '--accept-server-license-terms',
                '--disable-workspace-trust',
                '--host=127.0.0.1', // todo: allow making external for remote support
                `--port=${serverPort}`,
                `--connection-token=${connectionToken}`,
                `--server-data-dir=${serverRootDir}`,
                `--extensions-dir=${extensionsDir}`,
            ]
            const extensionHostDebugPort = debugMode ? reservedExtensionHostDebugPort : null
            const env = {
                ...process.env,
                TESTING_DOTCOM_URL: mitmProxy.sourcegraph.dotcom.endpoint,
                CODY_TESTING_BFG_DIR: path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.binaryTmpDir),
                CODY_TESTING_SYMF_DIR: path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.binaryTmpDir),
            }
            // payload is injected into the extension host when it's started
            const payload = []
            if (extensionHostDebugPort) {
                payload.push([
                    validOptions.waitForExtensionHostDebugger
                        ? 'inspect-brk-extensions'
                        : 'inspect-extension',
                    `${extensionHostDebugPort}`,
                ])
            }
            // TODO: allow for faster dev flow
            // payload.push(['extensionDevelopmentPath', CODY_VSCODE_ROOT_DIR])
            const config = {
                url: `http://127.0.0.1:${serverPort}/`,
                token: connectionToken,
                payload: payload,
                extensionHostDebugPort,
            }
            //@ts-ignore
            const serverProcess = await waitForVSCodeServerV2({
                extensionHostDebugPort,
                versionedServerExecutableDir,
                validOptions,
                args,
                env,
            })

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
            if (serverProcess.pid) {
                killChildrenSync(serverProcess.pid, 'SIGTERM')
                killSync(serverProcess.pid, 'SIGTERM')
            }
        },
        { scope: 'test' },
    ],
})

async function downloadVSCodeServer(
    config: {
        serverExecutableDir: string
    } & Pick<TestContext, 'validOptions'>
) {
    const platform = os.platform()
    const arch = os.arch()
    let commitSha = config.validOptions.vscodeCommitSha ?? ''
    const vscodeArtifactName = getVSCodeArtifactName(platform, arch)
    if (!commitSha) {
        const latestPath = path.join(config.serverExecutableDir, 'latest.json')
        // try and load the latest file if it already exists
        let latestContent: { lastChecked: string; hashes: string[] } | null = null
        try {
            const latestContentString = await fs.readFile(latestPath, 'utf-8')
            latestContent = JSON.parse(latestContentString)
        } catch (e) {
            // ignore error, we'll fetch the latest content
        }

        const now = new Date()
        if (
            !latestContent ||
            now.getTime() - new Date(latestContent.lastChecked).getTime() > 24 * 60 * 60 * 1000
        ) {
            // if not we need to download it
            const hashes = await (
                await fetch(
                    `https://update.code.visualstudio.com/api/commits/stable/${vscodeArtifactName}`
                )
            ).json()
            latestContent = { lastChecked: now.toISOString(), hashes }
            await fs.writeFile(latestPath, JSON.stringify(latestContent)).catch(() => null)
        }
        commitSha = latestContent.hashes[0]
    }

    if (!/^[0-9a-f]{40}$/.test(commitSha)) {
        throw new Error(`Invalid VSCode commit SHA: ${commitSha}`)
    }

    const versionedExecutableDir = path.join(config.serverExecutableDir, commitSha)

    const releaseLock = await waitForLock(config.serverExecutableDir, {
        lockfilePath: path.join(config.serverExecutableDir, `${commitSha}.lock`),
        delay: 100,
    })
    try {
        const ok = await fs.readFile(path.join(versionedExecutableDir, 'ok'), 'utf-8').catch(() => null)

        if (!ok) {
            await fs.rm(versionedExecutableDir, {
                recursive: true,
                force: true,
                retryDelay: 1000,
                maxRetries: 3,
            })
            console.log(`Downloading VSCode server for commit ${commitSha}`)
            await fs.mkdir(versionedExecutableDir, { recursive: true })
            const directoryName = `server-${vscodeArtifactName}-web`
            const downloadUrl = `https://update.code.visualstudio.com/commit:${commitSha}/${directoryName}/stable`
            await withTempDir(async tmpDir => {
                //can be either zip or gzip
                const archiveFile = path.join(tmpDir, 'archive')
                await downloadFile(downloadUrl, archiveFile)
                const unpackedPath = path.join(tmpDir, 'unzip')
                await new Promise((ok, fail) =>
                    szip.unpack(archiveFile, unpackedPath, err => {
                        if (err) {
                            fail(err)
                        }
                        ok(void 0)
                    })
                )
                await move(path.join(unpackedPath, `vscode-${directoryName}`), versionedExecutableDir, {
                    overwrite: true,
                })
                await fs.writeFile(path.join(versionedExecutableDir, 'ok'), 'ok')
            })
        }
    } finally {
        await releaseLock()
    }
    if ((await fs.readFile(path.join(versionedExecutableDir, 'ok'), 'utf-8')) !== 'ok') {
        throw new Error('VSCode server not found')
    }
    return versionedExecutableDir
}

async function waitForVSCodeServerV2(
    config: {
        versionedServerExecutableDir: string
        args: string[]
        env: Record<string, string>
        extensionHostDebugPort: number | null
    } & Pick<TestContext, 'validOptions'>
) {
    // const nodePath = path.join(versionedExecutableDir, isWindows() ? 'node.exe' : 'node')
    const extendedArgs = ['out/server-main.js', ...config.args]
    const serverProcess = spawn(isWindows() ? 'node.exe' : 'node', extendedArgs, {
        env: config.env,
        cwd: config.versionedServerExecutableDir,
        stdio: ['inherit', 'pipe', 'inherit'],
        detached: false,
    })
    const startPromise = new Promise<boolean>(ready => {
        serverProcess.on('exit', () => {
            ready(false)
        })
        serverProcess.stdout.addListener('data', (data: Buffer) => {
            //wiat for "Extension host agent started"
            const message = data.toString()
            if (message.includes('Extension host agent started')) {
                serverProcess.stdout.removeAllListeners('data')
                ready(true)
            }
        })
    })

    if (!(await startPromise)) {
        throw new Error('VSCode server not started')
    }
    serverProcess.stdout.removeAllListeners('data')
    serverProcess.removeAllListeners('exit')
    return serverProcess
}

async function installExtensions({
    versionedServerExecutableDir,
    validOptions,
    extensionsDir,
}: Pick<TestContext, 'validOptions'> & {
    versionedServerExecutableDir: string
    extensionsDir: string
    userDataDir: string
}) {
    // We start by installing all extensions to a shared cache dir. This speeds up tests without any risk of flake.
    const nodeExecutable = isWindows() ? 'node.exe' : 'node'
    const sharedExtensionsDir = path.resolve(CODY_VSCODE_ROOT_DIR, validOptions.vscodeExtensionCacheDir)
    await fs.mkdir(sharedExtensionsDir, { recursive: true })

    if (validOptions.vscodeExtensions.length > 0) {
        const args = [
            'out/server-main.js',
            `--extensions-dir=${sharedExtensionsDir}`,
            ...validOptions.vscodeExtensions.map(extension => `--install-extension=${extension}`),
        ]
        await pspawn(nodeExecutable, args, {
            env: {
                ...process.env,
            },
            cwd: versionedServerExecutableDir,
            stdio: ['inherit', 'ignore', 'ignore'],
        })
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
    await pspawn(
        nodeExecutable,
        ['out/server-main.js', `--extensions-dir=${extensionsDir}`, '--list-extensions'],
        {
            env: {
                ...process.env,
            },
            cwd: versionedServerExecutableDir,
            stdio: ['inherit', 'ignore', 'ignore'],
        }
    )
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

function getVSCodeArtifactName(platform: NodeJS.Platform, arch: string): string {
    //copied from https://github.com/microsoft/vscode/blob/main/cli/src/update_service.rs#L239
    switch (`${platform}/${arch}`) {
        case 'linux/x64':
            return 'linux-x64'
        case 'linux/arm64':
            return 'linux-arm64'
        case 'linux/arm':
            return 'linux-armhf'
        case 'darwin/x64':
            return 'darwin'
        case 'darwin/arm64':
            return 'darwin-arm64'
        case 'win32/x64':
            return 'win32-x64'
        case 'win32/ia32':
            return 'win32'
        case 'win32/arm64':
            return 'win32-arm64'
        case 'linux/x64/legacy':
            return 'linux-legacy-x64'
        case 'linux/arm64/legacy':
            return 'linux-legacy-arm64'
        case 'linux/arm/legacy':
            return 'linux-legacy-armhf'
        case 'linux/alpine/x64':
            return 'linux-alpine'
        case 'linux/alpine/arm64':
            return 'alpine-arm64'
        default:
            throw new Error(`Unsupported platform: ${platform}/${arch}`)
    }
}

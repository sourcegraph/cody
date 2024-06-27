import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SemverString } from '@sourcegraph/cody-shared/src/utils'
import { Mutex } from 'async-mutex'
import * as vscode from 'vscode'
import { sleep } from '../../completions/utils'
import { downloadFile, fileExists, unzip, upsertFile } from '../../local-context/utils'
import { logDebug, logError } from '../../log'
import { Arch, Platform, getOSArch } from '../../os'
import { captureException } from '../../services/sentry/sentry'

// Available releases: https://github.com/sourcegraph/bfg/releases
export type BfgVersionString = SemverString<''>
export const defaultBfgVersion: BfgVersionString = '5.4.6040'

export const _config = {
    FILE_DOWNLOAD_LOCK_DURATION: 5000,
    FILE_LOCK_RETRY_DELAY: 1000,
} as const

/**
 * Get the path to `bfg` binary. If possible it will be downloaded.
 */
export async function getBfgPath(context: vscode.ExtensionContext): Promise<string | null> {
    // If user-specified symf path is set, use that
    // TODO: maybe we do want an option to download bfg if it's not found?
    const config = vscode.workspace.getConfiguration()
    const userBfgPath = config.get<string>('cody.experimental.cody-engine.path')
    if (userBfgPath) {
        if (!(await fileExists(userBfgPath))) {
            throw new Error(`bfg can't be loaded from user provided path: ${userBfgPath}`)
        }
        logDebug('CodyEngine', `Skipping download. Using user-provided bfg path: ${userBfgPath}`)
        return userBfgPath
    }

    const bfgContainingDir =
        typeof process !== 'undefined' && process.env.CODY_TESTING_BFG_DIR
            ? process.env.CODY_TESTING_BFG_DIR
            : path.join(context.globalStorageUri.fsPath, 'cody-engine')

    // remove any preceding v symbol
    const bfgVersion = SemverString.forcePrefix(
        '',
        config.get<string>('cody.experimental.cody-engine.version', defaultBfgVersion)
    )

    const bfgPath = await _upsertBfgForPlatform(bfgContainingDir, bfgVersion)
    return bfgPath
}

// this protects agains multiple async functions in the same node process from
// starting a download
const processDownloadLock = new Mutex()

export async function _upsertBfgForPlatform(
    containingDir: string,
    version: BfgVersionString
): Promise<string | null> {
    const { platform, arch } = getOSArch()
    if (!platform || !arch) {
        // show vs code error message
        void vscode.window.showErrorMessage(
            `No bfg binary available for ${os.platform()}/${os.machine()}`
        )
        logError('CodyEngine', `No bfg binary available for ${os.platform()}/${os.machine()}`)
        return null
    }
    const { bfgFilename, bfgUnzippedFilename, rfc795Arch } = _getNamesForPlatform(
        platform,
        arch,
        version
    )
    const bfgPath = path.join(containingDir, bfgFilename)

    if (await fileExists(bfgPath)) {
        logDebug('CodyEngine', `using downloaded bfg path "${bfgPath}"`)
        return bfgPath
    }

    const bfgURL = `https://github.com/sourcegraph/bfg/releases/download/v${version}/bfg-${platform}-${rfc795Arch}.zip`

    return await processDownloadLock.runExclusive(async () => {
        try {
            const wasDownloaded = await downloadBfgBinary({
                bfgPath,
                bfgURL,
                bfgFilename,
                bfgUnzippedFilename,
            })
            if (wasDownloaded) {
                void removeOldBfgBinaries(containingDir, bfgFilename)
            }
            return bfgPath
        } catch (error) {
            captureException(error)
            void vscode.window.showErrorMessage(`Failed to download bfg: ${error}`)
            return null
        }
    })
}

export function _getNamesForPlatform(
    platform: Platform,
    arch: Arch,
    version: BfgVersionString
): { bfgFilename: string; bfgUnzippedFilename: string; rfc795Arch: string } {
    // Rename returned architecture to match RFC 795 conventions
    // https://docs.google.com/document/d/11cw-7dAp93JmasITNSNCtx31xrQsNB1L2OoxVE6zrTc/edit
    const archRenames = new Map([
        ['aarch64', 'arm64'],
        ['x86_64', 'x64'],
    ])
    let rfc795Arch = archRenames.get(arch ?? '') ?? arch
    if (rfc795Arch === Arch.Arm64 && platform === Platform.Windows) {
        // On Windows Arm PCs, we rely on emulation and use the x64 binary.
        // See https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation
        rfc795Arch = Arch.X64
    }

    const bfgFilename = `cody-engine-${version}-${platform}-${rfc795Arch}`
    const bfgUnzippedFilename = platform === Platform.Windows ? 'bfg.exe' : 'bfg'
    return { bfgFilename, rfc795Arch, bfgUnzippedFilename }
}

async function downloadBfgBinary({
    bfgPath,
    bfgFilename,
    bfgUnzippedFilename,
    bfgURL,
}: {
    bfgPath: string
    bfgFilename: string
    bfgUnzippedFilename: string
    bfgURL: string
}): Promise<boolean> {
    logDebug('CodyEngine', `downloading bfg from ${bfgURL}`)
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Downloading Cody search engine (bfg)',
            cancellable: false,
        },
        async (progress, cancel) => {
            progress.report({ message: 'Downloading bfg' })
            while (!cancel.isCancellationRequested) {
                if (await fileExists(bfgPath)) {
                    logDebug('CodyEngine', 'bfg already downloaded, reusing')
                    return false
                }
                const bfgTmpDir = `${bfgPath}.tmp`
                await fs.mkdir(bfgTmpDir, { recursive: true })

                const bfgZipFile = path.join(bfgTmpDir, `${bfgFilename}.zip`)
                // try and acquire a file lock, giving another process some grace to write data to it
                const bfgZipFileLock = await upsertFile(bfgZipFile, _config.FILE_DOWNLOAD_LOCK_DURATION)
                if (!bfgZipFileLock) {
                    logDebug('CodyEngine', 'Another process is already downloading bfg, waiting...')
                    await sleep(_config.FILE_DOWNLOAD_LOCK_DURATION)
                    continue
                }
                await downloadFile(bfgURL, bfgZipFile, cancel)
                progress.report({ message: 'Extracting bfg' })
                await unzip(bfgZipFile, bfgTmpDir)
                logDebug('CodyEngine', `downloaded bfg to ${bfgTmpDir}`)

                const tmpFile = path.join(bfgTmpDir, bfgUnzippedFilename)
                await fs.chmod(tmpFile, 0o755)
                await fs.rename(tmpFile, bfgPath)
                await fs.rm(bfgTmpDir, { recursive: true })

                logDebug('CodyEngine', `extracted bfg to ${bfgPath}`)
                return true
            }
            return false
        }
    )
}

async function removeOldBfgBinaries(containingDir: string, currentBfgPath: string): Promise<void> {
    const bfgDirContents = await fs.readdir(containingDir)
    const oldBfgBinaries = bfgDirContents.filter(
        f => f.startsWith('cody-engine-') && f !== currentBfgPath
    )
    for (const oldBfgBinary of oldBfgBinaries) {
        await fs.rm(path.join(containingDir, oldBfgBinary))
    }
}

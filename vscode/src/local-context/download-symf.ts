import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { SemverString } from '@sourcegraph/cody-shared/src/utils'
import * as vscode from 'vscode'
import { waitForLock } from '../lockfile'
import { logDebug, logError } from '../log'
import { type Arch, Platform, getOSArch } from '../os'
import { captureException } from '../services/sentry/sentry'
import { downloadFile, fileExists, unzip } from './utils'

type SymfVersionString = SemverString<'v'>
const symfVersion: SymfVersionString = 'v0.0.16'

export const _config = {
    //delay before trying to re-lock a active file
    FILE_LOCK_RETRY_DELAY: 500,
} as const

/**
 * Get the path to `symf` binary. If possible it will be downloaded.
 */
export async function getSymfPath(context: vscode.ExtensionContext): Promise<string | null> {
    // If user-specified symf path is set, use that
    // TODO: maybe we do want an option to download symf if it's not found?
    const config = vscode.workspace.getConfiguration()
    const userSymfPath =
        config.get<string>('cody.experimental.symf.path') ??
        config.get<string>('cody.internal.symf.path')
    if (userSymfPath) {
        if (!(await fileExists(userSymfPath))) {
            throw new Error(`symf can't be loaded from user provided path: ${userSymfPath}`)
        }
        logDebug('symf', `Skipping download. Using user specified symf path: ${userSymfPath}`)
        return userSymfPath
    }

    //TODO(rnauta): move all test overrides to helper class
    const symfContainingDir =
        typeof process !== 'undefined' && process.env.CODY_TESTING_SYMF_DIR
            ? process.env.CODY_TESTING_SYMF_DIR
            : path.join(context.globalStorageUri.fsPath, 'symf')

    const symfPath = await _upsertSymfForPlatform(symfContainingDir)
    return symfPath
}

/**
 * Returns the platform specific symf path or downloads it if needed
 * @param containingDir the directory in which the symf binary will be stored
 * @returns symf path for platform
 */
export async function _upsertSymfForPlatform(containingDir: string): Promise<string | null> {
    const { platform, arch } = getOSArch()
    if (!platform || !arch) {
        // show vs code error message
        void vscode.window.showErrorMessage(
            `No symf binary available for ${os.platform()}/${os.machine()}`
        )
        logError('CodyEngine', `No symf binary available for ${os.platform()}/${os.machine()}`)
        return null
    }
    const { symfFilename, symfUnzippedFilename, zigPlatform } = _getNamesForPlatform(platform, arch)
    const symfPath = path.join(containingDir, symfFilename)

    if (await fileExists(symfPath)) {
        logDebug('symf', `using downloaded symf "${symfPath}"`)
        return symfPath
    }

    const symfURL = `https://github.com/sourcegraph/symf/releases/download/${symfVersion}/symf-${arch}-${zigPlatform}.zip`
    // Download symf binary with vscode progress api
    try {
        const wasDownloaded = await downloadSymfBinary({
            symfPath,
            symfURL,
            symfFilename,
            symfUnzippedFilename,
        })
        if (wasDownloaded) {
            void removeOldSymfBinaries(containingDir, symfFilename)
        }
        return symfPath
    } catch (error) {
        captureException(error)
        void vscode.window.showErrorMessage(`Failed to download symf: ${error}`)
        return null
    }
}

export function _getNamesForPlatform(
    platform: Platform,
    arch: Arch
): { symfFilename: string; symfUnzippedFilename: string; zigPlatform: string } {
    // Releases (eg at https://github.com/sourcegraph/symf/releases) are named with the Zig platform
    // identifier (linux-musl, windows-gnu, macos).
    const zigPlatform =
        platform === Platform.Linux
            ? 'linux-musl'
            : platform === Platform.Windows
              ? 'windows-gnu'
              : platform

    const symfFilename = `symf-${symfVersion}-${arch}-${platform}`
    const symfUnzippedFilename = `symf-${arch}-${zigPlatform}` // the filename inside the zip
    return { symfFilename, symfUnzippedFilename, zigPlatform }
}

/**
 * Downloads symf from the given URL to a given path.
 * @returns true if the file was downloaded new or false if the file already existed
 */
async function downloadSymfBinary({
    symfPath,
    symfFilename,
    symfUnzippedFilename,
    symfURL,
}: {
    symfPath: string
    symfFilename: string
    symfUnzippedFilename: string
    symfURL: string
}): Promise<boolean> {
    logDebug('symf', `downloading symf from ${symfURL}`)
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Downloading Cody search engine (symf)',
            cancellable: false,
        },
        async (progress, cancel) => {
            progress.report({ message: 'Checking symf status' })
            const abortController = new AbortController()
            cancel.onCancellationRequested(() => abortController.abort())

            const symfDir = path.dirname(symfPath)
            await fs.mkdir(symfDir, { recursive: true })
            const unlockFn = await waitForLock(symfDir, {
                delay: _config.FILE_LOCK_RETRY_DELAY,
                lockfilePath: `${symfPath}.lock`,
            })

            try {
                if (await fileExists(symfPath)) {
                    logDebug('symf', 'symf already downloaded, reusing')
                    return false
                }
                progress.report({ message: 'Downloading symf' })

                const symfTmpDir = `${symfPath}.tmp`
                await fs.mkdir(symfTmpDir, { recursive: true })
                const symfZipFile = path.join(symfTmpDir, `${symfFilename}.zip`)

                await downloadFile(symfURL, symfZipFile, abortController.signal)
                progress.report({ message: 'Extracting symf' })
                await unzip(symfZipFile, symfTmpDir)
                logDebug('symf', `downloaded symf to ${symfTmpDir}`)

                const tmpFile = path.join(symfTmpDir, symfUnzippedFilename)
                await fs.chmod(tmpFile, 0o755)
                await fs.rename(tmpFile, symfPath)
                await fs.rm(symfTmpDir, { recursive: true })

                logDebug('symf', `extracted symf to ${symfPath}`)
                return true
            } finally {
                unlockFn?.()
            }
        }
    )
}

async function removeOldSymfBinaries(containingDir: string, currentSymfPath: string): Promise<void> {
    const symfDirContents = await fs.readdir(containingDir)
    const oldSymfBinaries = symfDirContents.filter(f => f.startsWith('symf-') && f !== currentSymfPath)
    for (const oldSymfBinary of oldSymfBinaries) {
        await fs.rm(path.join(containingDir, oldSymfBinary))
    }
}

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import fspromises from 'fs/promises'

import axios from 'axios'
import * as unzipper from 'unzipper'
import * as vscode from 'vscode'

import { Mutex } from 'async-mutex'
import { logDebug } from '../log'
import { getOSArch } from '../os'
import { captureException } from '../services/sentry/sentry'

const symfVersion = 'v0.0.7'

/**
 * Get the path to `symf`. If the symf binary is not found, download it.
 */
export async function getSymfPath(context: vscode.ExtensionContext): Promise<string | null> {
    // If user-specified symf path is set, use that
    const config = vscode.workspace.getConfiguration()
    const userSymfPath = config.get<string>('cody.experimental.symf.path')
    if (userSymfPath) {
        logDebug('symf', `using user symf: ${userSymfPath}`)
        return userSymfPath
    }

    const symfContainingDir = path.join(context.globalStorageUri.fsPath, 'symf')
    return await _getSymfPath(symfContainingDir)
}

const downloadLock = new Mutex()

export async function _getSymfPath(
    symfContainingDir: string,
    actualDownloadSymf: (op: {
        symfPath: string
        symfFilename: string
        symfUnzippedFilename: string
        symfURL: string
    }) => Promise<void> = downloadSymf
): Promise<string | null> {
    const { platform, arch } = getOSArch()
    if (!platform || !arch) {
        // show vs code error message
        void vscode.window.showErrorMessage(
            `No symf binary available for ${os.platform()}/${os.machine()}`
        )
        return null
    }
    // Releases (eg at https://github.com/sourcegraph/symf/releases) are named with the Zig platform
    // identifier (linux-musl, windows-gnu, macos).
    const zigPlatform =
        platform === 'linux' ? 'linux-musl' : platform === 'windows' ? 'windows-gnu' : platform

    const symfFilename = `symf-${symfVersion}-${arch}-${platform}`
    const symfUnzippedFilename = `symf-${arch}-${zigPlatform}` // the filename inside the zip
    const symfPath = path.join(symfContainingDir, symfFilename)
    if (await fileExists(symfPath)) {
        logDebug('symf', `using downloaded symf "${symfPath}"`)
        return symfPath
    }

    const symfURL = `https://github.com/sourcegraph/symf/releases/download/${symfVersion}/symf-${arch}-${zigPlatform}.zip`

    // Download symf binary with vscode progress api
    try {
        await downloadLock.acquire()
        // Re-check if it has been downloaded
        if (await fileExists(symfPath)) {
            logDebug('symf', 'symf already downloaded, reusing')
            return symfPath
        }

        await actualDownloadSymf({ symfPath, symfURL, symfFilename, symfUnzippedFilename })
        void removeOldSymfBinaries(symfContainingDir, symfFilename)
    } catch (error) {
        captureException(error)
        void vscode.window.showErrorMessage(`Failed to download symf: ${error}`)
        return null
    } finally {
        downloadLock.release()
    }

    return symfPath
}

async function downloadSymf({
    symfPath,
    symfFilename,
    symfUnzippedFilename,
    symfURL,
}: {
    symfPath: string
    symfFilename: string
    symfUnzippedFilename: string
    symfURL: string
}): Promise<void> {
    logDebug('symf', `downloading symf from ${symfURL}`)

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Downloading Cody search engine (symf)',
            cancellable: false,
        },
        async progress => {
            const symfTmpDir = `${symfPath}.tmp`
            progress.report({ message: 'Downloading symf and extracting symf' })

            await fspromises.mkdir(symfTmpDir, { recursive: true })
            const symfZipFile = path.join(symfTmpDir, `${symfFilename}.zip`)
            await downloadFile(symfURL, symfZipFile)
            await unzipSymf(symfZipFile, symfTmpDir)
            logDebug('symf', `downloaded symf to ${symfTmpDir}`)

            const tmpFile = path.join(symfTmpDir, symfUnzippedFilename)
            await fspromises.chmod(tmpFile, 0o755)
            await fspromises.rename(tmpFile, symfPath)
            await fspromises.rm(symfTmpDir, { recursive: true })

            logDebug('symf', `extracted symf to ${symfPath}`)
        }
    )
}

export async function fileExists(path: string): Promise<boolean> {
    try {
        await fspromises.access(path)
        return true
    } catch {
        return false
    }
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
    logDebug('Symf', `downloading from URL ${url}`)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 10,
    })

    const stream = fs.createWriteStream(outputPath)
    response.data.pipe(stream)

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
    })
}

async function unzipSymf(zipFile: string, destinationDir: string): Promise<void> {
    const zip = fs.createReadStream(zipFile).pipe(unzipper.Parse({ forceStream: true }))
    for await (const entry of zip) {
        if (entry.path.endsWith('/')) {
            continue
        }
        entry.pipe(fs.createWriteStream(path.join(destinationDir, entry.path)))
    }
}

async function removeOldSymfBinaries(containingDir: string, currentSymfPath: string): Promise<void> {
    const symfDirContents = await fspromises.readdir(containingDir)
    const oldSymfBinaries = symfDirContents.filter(f => f.startsWith('symf-') && f !== currentSymfPath)
    for (const oldSymfBinary of oldSymfBinaries) {
        await fspromises.rm(path.join(containingDir, oldSymfBinary))
    }
}

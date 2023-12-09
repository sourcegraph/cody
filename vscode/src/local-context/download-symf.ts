import { promises as fspromises } from 'fs'
import * as os from 'os'
import * as path from 'path'

import axios from 'axios'
import * as unzip from 'unzipper'
import * as vscode from 'vscode'

import { logDebug } from '../log'
import { getOSArch } from '../os'
import { captureException } from '../services/sentry/sentry'

const symfVersion = 'v0.0.2'

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

    const { platform, arch } = getOSArch()
    if (!platform || !arch) {
        // show vs code error message
        void vscode.window.showErrorMessage(`No symf binary available for ${os.platform()}/${os.machine()}`)
        return null
    }

    const symfContainingDir = path.join(context.globalStorageUri.fsPath, 'symf')
    const symfFilename = `symf-${symfVersion}-${arch}-${platform}`
    const symfPath = path.join(symfContainingDir, symfFilename)
    if (await fileExists(symfPath)) {
        logDebug('symf', `using downloaded symf "${symfPath}"`)
        return symfPath
    }

    // Releases (eg at https://github.com/sourcegraph/symf/releases) are named with the Zig platform
    // identifier (linux-musl, windows-gnu, macos).
    const zigPlatform = platform === 'linux' ? 'linux-musl' : platform === 'windows' ? 'windows-gnu' : platform

    const symfURL = `https://github.com/sourcegraph/symf/releases/download/${symfVersion}/symf-${arch}-${zigPlatform}.zip`
    logDebug('symf', `downloading symf from ${symfURL}`)

    // Download symf binary with vscode progress api
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading Cody search engine (symf)',
                cancellable: false,
            },
            async progress => {
                progress.report({ message: 'Downloading symf and extracting symf' })

                const symfTmpDir = symfPath + '.tmp'

                await downloadFile(symfURL, symfTmpDir)
                logDebug('symf', `downloaded symf to ${symfTmpDir}`)

                const tmpFile = path.join(symfTmpDir, `symf-${arch}-${zigPlatform}`)
                await fspromises.chmod(tmpFile, 0o755)
                await fspromises.rename(tmpFile, symfPath)
                await fspromises.rmdir(symfTmpDir, { recursive: true })

                logDebug('symf', `extracted symf to ${symfPath}`)
            }
        )
        void removeOldSymfBinaries(symfContainingDir, symfFilename)
    } catch (error) {
        captureException(error)
        void vscode.window.showErrorMessage(`Failed to download symf: ${error}`)
        return null
    }

    return symfPath
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
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 10,
    })

    const uz = unzip.Extract({ path: outputPath })
    response.data.pipe(uz)

    await new Promise((resolve, reject) => {
        uz.on('finish', resolve)
        uz.on('error', reject)
    })
}

async function removeOldSymfBinaries(containingDir: string, currentSymfPath: string): Promise<void> {
    const symfDirContents = await fspromises.readdir(containingDir)
    const oldSymfBinaries = symfDirContents.filter(f => f.startsWith('symf-') && f !== currentSymfPath)
    for (const oldSymfBinary of oldSymfBinaries) {
        await fspromises.rm(path.join(containingDir, oldSymfBinary))
    }
}

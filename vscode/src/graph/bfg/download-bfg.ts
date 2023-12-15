import * as fs from 'fs'
import { promises as fspromises } from 'fs'
import path from 'path'

import axios from 'axios'
import * as unzipper from 'unzipper'
import * as vscode from 'vscode'

import { fileExists } from '../../local-context/download-symf'
import { logDebug } from '../../log'
import { getOSArch } from '../../os'
import { captureException } from '../../services/sentry/sentry'

// Available releases: https://github.com/sourcegraph/bfg/releases
// Do not include 'v' in this string.
const defaultBfgVersion = '5.2.12792'

// We use this Promise to only have one downloadBfg running at once.
let serializeBfgDownload: Promise<string | null> = Promise.resolve(null)

export async function downloadBfg(context: vscode.ExtensionContext): Promise<string | null> {
    // First, wait for any in-progress downloads.
    await serializeBfgDownload

    // Now we are the in-progress download.
    serializeBfgDownload = (async () => {
        const config = vscode.workspace.getConfiguration()
        const userBfgPath = config.get<string>('cody.experimental.cody-engine.path')
        if (userBfgPath) {
            const bfgStat = await fspromises.stat(userBfgPath)
            if (!bfgStat.isFile()) {
                throw new Error(`not a file: ${userBfgPath}`)
            }
            logDebug('CodyEngine', `using user-provided path: ${userBfgPath} ${bfgStat.isFile()}`)
            return userBfgPath
        }

        const osArch = getOSArch()
        if (!osArch) {
            logDebug('CodyEngine', 'getOSArch returned nothing')
            return null
        }
        const { platform, arch } = osArch

        if (!arch) {
            logDebug('CodyEngine', 'getOSArch returned undefined arch')
            return null
        }

        if (!platform) {
            logDebug('CodyEngine', 'getOSArch returned undefined platform')
            return null
        }
        // Rename returned architecture to match RFC 795 conventions
        // https://docs.google.com/document/d/11cw-7dAp93JmasITNSNCtx31xrQsNB1L2OoxVE6zrTc/edit
        const archRenames = new Map([
            ['aarch64', 'arm64'],
            ['x86_64', 'x64'],
        ])
        let rfc795Arch = archRenames.get(arch ?? '') ?? arch
        if (rfc795Arch === 'arm64' && platform === 'win') {
            // On Windows Arm PCs, we rely on emulation and use the x64 binary.
            // See https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation
            rfc795Arch = 'x64'
        }

        const bfgContainingDir = path.join(context.globalStorageUri.fsPath, 'cody-engine')
        const bfgVersion = config.get<string>('cody.experimental.cody-engine.version', defaultBfgVersion)
        await fspromises.mkdir(bfgContainingDir, { recursive: true })
        const bfgFilename = `cody-engine-${bfgVersion}-${platform}-${rfc795Arch}`
        const bfgPath = path.join(bfgContainingDir, bfgFilename)
        const isAlreadyDownloaded = await fileExists(bfgPath)
        if (isAlreadyDownloaded) {
            logDebug('CodyEngine', `using downloaded path "${bfgPath}"`)
            return bfgPath
        }

        const bfgURL = `https://github.com/sourcegraph/bfg/releases/download/v${bfgVersion}/bfg-${platform}-${rfc795Arch}.zip`
        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Window,
                    title: 'Downloading cody-engine',
                    cancellable: false,
                },
                async progress => {
                    progress.report({ message: 'Downloading cody-engine' })
                    const bfgZip = path.join(bfgContainingDir, 'bfg.zip')
                    await downloadBfgBinary(bfgURL, bfgZip)
                    await unzipBfg(bfgZip, bfgContainingDir)
                    logDebug('CodyEngine', bfgPath)
                    // The zip file contains a binary named `bfg` or `bfg.exe`. We unzip it with that name first and then rename into
                    // a version-specific binary so that we can delete old versions of bfg.
                    const unzipPath = platform === 'windows' ? 'bfg.exe' : 'bfg'
                    await fspromises.rename(path.join(bfgContainingDir, unzipPath), bfgPath)
                    await fspromises.chmod(bfgPath, 0o755)
                    await fspromises.rm(bfgZip)
                    logDebug('CodyEngine', `downloaded cody-engine to ${bfgPath}`)
                }
            )
            void removeOldBfgBinaries(bfgContainingDir, bfgFilename)
        } catch (error) {
            captureException(error)
            void vscode.window.showErrorMessage(`Failed to download bfg from URL ${bfgURL}: ${error}`)
            return null
        }
        return bfgPath
    })()
    return serializeBfgDownload
}

async function unzipBfg(zipFile: string, destinationDir: string): Promise<void> {
    const zip = fs.createReadStream(zipFile).pipe(unzipper.Parse({ forceStream: true }))
    for await (const entry of zip) {
        if (entry.path.endsWith('/')) {
            continue
        }
        entry.pipe(fs.createWriteStream(path.join(destinationDir, entry.path)))
    }
}

async function downloadBfgBinary(url: string, destination: string): Promise<void> {
    logDebug('CodyEngine', `downloading from URL ${url}`)
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        maxRedirects: 10,
    })

    const stream = fs.createWriteStream(destination)
    response.data.pipe(stream)

    await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
    })
}

async function removeOldBfgBinaries(containingDir: string, currentBfgPath: string): Promise<void> {
    const bfgDirContents = await fspromises.readdir(containingDir)
    const oldBfgBinaries = bfgDirContents.filter(f => f.startsWith('bfg') && f !== currentBfgPath)
    for (const oldBfgBinary of oldBfgBinaries) {
        await fspromises.rm(path.join(containingDir, oldBfgBinary))
    }
}

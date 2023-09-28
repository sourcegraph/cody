import * as fs from 'fs'
import { promises as fspromises } from 'fs'
import path from 'path'

import axios from 'axios'
import * as unzipper from 'unzipper'
import * as vscode from 'vscode'

import { fileExists } from '../../local-context/download-symf'
import { logDebug } from '../../log'
import { getOSArch } from '../../os'

const bfgVersion = '0.1.0'

export async function downloadBfg(context: vscode.ExtensionContext): Promise<string | null> {
    const config = vscode.workspace.getConfiguration()
    const userBfgPath = config.get<string>('cody.experimental.bfg.path')
    if (userBfgPath) {
        const bfgStat = await fspromises.stat(userBfgPath)
        console.log({ stat: bfgStat.isFile() })
        if (!bfgStat.isFile()) {
            throw new Error(`not a file: ${userBfgPath}`)
        }
        logDebug('bfg', `using user bfg: ${userBfgPath} ${bfgStat.isFile()}`)
        return userBfgPath
    }

    const osArch = getOSArch()
    if (!osArch) {
        logDebug('bfg', 'getOSArch returned nothing')
        return null
    }
    const { platform, arch } = osArch

    const bfgContainingDir = path.join(context.globalStorageUri.fsPath, 'bfg')
    await fspromises.mkdir(bfgContainingDir, { recursive: true })
    const bfgFilename = `bfg-${bfgVersion}-${arch}-${platform}`
    const bfgPath = path.join(bfgContainingDir, bfgFilename)
    const isAlreadyDownloaded = await fileExists(bfgPath)
    if (isAlreadyDownloaded) {
        logDebug('bfg', `using downloaded bfg "${bfgPath}"`)
        return bfgPath
    }

    const bfgURL = `https://github.com/sourcegraph/bfg/releases/download/v${bfgVersion}/bfg-${arch}-${platform}.zip`
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Downloading code graph utility "bfg"',
                cancellable: false,
            },
            async progress => {
                progress.report({ message: 'Downloading bfg and extracting bfg' })
                const bfgZip = path.join(bfgContainingDir, 'bfg.zip')
                await downloadBfgBinary(bfgURL, bfgZip)
                await unzipBfg(bfgZip, bfgPath)
                await fspromises.chmod(bfgPath, 0o755)
                logDebug('BFG', `downloaded bfg to ${bfgPath}`)
            }
        )
        void removeOldBfgBinaries(bfgContainingDir, bfgFilename)
    } catch (error) {
        void vscode.window.showErrorMessage(`Failed to download bfg from URL ${bfgURL}: ${error}`)
        return null
    }
    return bfgPath
}

async function unzipBfg(zipFile: string, destination: string): Promise<void> {
    const zip = fs.createReadStream(zipFile).pipe(unzipper.Parse({ forceStream: true }))
    for await (const entry of zip) {
        const fileName = entry.path
        if (fileName === path.basename(destination)) {
            entry.pipe(fs.createWriteStream(destination))
        } else {
            entry.autodrain()
        }
    }
}

async function downloadBfgBinary(url: string, destination: string): Promise<void> {
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
    const oldBfgBinaries = bfgDirContents.filter(f => f.startsWith('bfg-') && f !== currentBfgPath)
    for (const oldBfgBinary of oldBfgBinaries) {
        await fspromises.rm(path.join(containingDir, oldBfgBinary))
    }
}

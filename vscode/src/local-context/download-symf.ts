import * as os from 'os'
import * as vscode from 'vscode'
import { promises as fs } from 'fs'

import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";
import { logDebug } from '../log'

const symfVersion = 'v0.0.0'

/**
 * Get the path to `symf`. If the symf binary is not found, download it.
 */
export async function getManagedSymfPath(context: vscode.ExtensionContext): Promise<string | null> {
    // If user-specified symf path is set, use that
    const config = vscode.workspace.getConfiguration()
    const userSymfPath = config.get<string>('experimentalSymfPath')
    if (userSymfPath) {
        logDebug('symf', `using user symfPath ${userSymfPath}`)
        return userSymfPath
    }

    // Otherwise, download and return the path to the downloaded symf binary
    const fileDownloader: FileDownloader = await getApi()

    let symfPath = await fileDownloader.tryGetItem('symf', context)
    if (symfPath) {
        logDebug('symf', `using symf at ${symfPath.fsPath}`)
        return symfPath.fsPath
    }

    return await downloadSymf(context, fileDownloader)
}

async function downloadSymf(context: vscode.ExtensionContext, fileDownloader: FileDownloader): Promise<string | null> {
    const osArch = getOSArch()
    if (!osArch) {
        return null
    }

    const { platform, arch } = osArch
    const symfURL = `https://github.com/sourcegraph/symf/releases/download/${symfVersion}/symf-${arch}-${platform}`
    logDebug('symf', `downloading symf from ${symfURL}`)

    // Download symf binary with vscode progress api
    const file = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Downloading symf tool for semantic code search",
        cancellable: true
    }, async (progress, token) => {
        const file: vscode.Uri = await fileDownloader.downloadFile(
            vscode.Uri.parse(symfURL),
            'symf',
            context,
            token,
            undefined,
            { shouldUnzip: false },
        )
        return file
    })
    logDebug('symf', `downloaded symf to ${file.fsPath}`)
    // Make the file permissions executable
    await fs.chmod(file.fsPath, 0o755)

    return file.fsPath
}

function getOSArch(): { platform: string; arch: string } | null {
    const nodePlatformToPlatform: { [key: string]: string } = {
        darwin: 'macos',
        linux: 'linux',
        win32: 'windows',
    }
    const nodeMachineToArch: { [key: string]: string } = {
        arm64: 'aarch64',
        aarch64: 'aarch64',
        x86_64: 'x86_64',
        i386: 'x86',
        i686: 'x86',
    }

    const platform = nodePlatformToPlatform[os.platform()]
    const arch = nodeMachineToArch[os.machine()]
    if (!platform || !arch) {
        // show vs code error message
        vscode.window.showErrorMessage(`No symf binary available for ${os.platform()}/${os.machine()}`)
        return null
    }
    return {
        platform,
        arch,
    }
}
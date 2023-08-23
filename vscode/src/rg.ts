import fs from 'node:fs/promises'
import path from 'path'

import * as vscode from 'vscode'

/**
 * Get the path to `rg` (ripgrep) that is bundled with VS Code.
 */
export async function getRgPath(): Promise<string | null> {
    if (process.env.MOCK_RG_PATH) {
        return process.env.MOCK_RG_PATH
    }

    const rgExe = process.platform === 'win32' ? 'rg.exe' : 'rg'
    const candidateDirs = ['node_modules/@vscode/ripgrep/bin', 'node_modules.asar.unpacked/@vscode/ripgrep/bin']
    for (const dir of candidateDirs) {
        const rgPath = path.resolve(vscode.env.appRoot, dir, rgExe)
        const exists = await fs
            .access(rgPath)
            .then(() => true)
            .catch(() => false)
        if (exists) {
            return rgPath
        }
    }

    console.log('Did not find bundled `rg`.')
    return null
}

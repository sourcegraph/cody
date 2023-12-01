import { exec } from 'child_process'
import { promisify } from 'util'

import * as vscode from 'vscode'

export interface SimpleRepository {
    uri: vscode.Uri
    commit: string
}

const execPromise = promisify(exec)

export async function inferGitRepository(uri: vscode.Uri): Promise<SimpleRepository | null> {
    const { stdout: toplevel } = await execPromise('git rev-parse --show-toplevel', { cwd: uri.fsPath })
    if (!toplevel) {
        return null
    }
    const { stdout: commit } = await execPromise('git rev-parse --abbrev-ref HEAD', { cwd: uri.fsPath })
    if (!commit) {
        return null
    }
    return {
        uri: vscode.Uri.file(toplevel.trim()),
        commit: commit.trim(),
    }
}

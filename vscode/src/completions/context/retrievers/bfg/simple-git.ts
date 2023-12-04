import { exec } from 'child_process'
import { promisify } from 'util'

import * as vscode from 'vscode'

export interface SimpleRepository {
    uri: vscode.Uri
    commit: string
}

const execPromise = promisify(exec)

/**
 * Returns a git repo metadata given any path that belongs to a git repo,
 * regardless if it's the root directory or not.
 *
 * This function invokes the `git` CLI with the assumption that it's going to be
 * installed on the user's computer. This is not going to work everywhere but
 * it's a starting point. Ideally, we should use a pure JS implementation
 * instead so that we don't have to rely on external tools.
 */
export async function inferGitRepository(uri: vscode.Uri): Promise<SimpleRepository | null> {
    try {
        // invoking `git` like this works on Windows when git.exe is installed in Path.
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
    } catch {
        return null
    }
}

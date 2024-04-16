import cp from 'node:child_process'
import util from 'node:util'
import type * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { pathFunctionsForURI } from '@sourcegraph/cody-shared/src/common/path'

export async function gitRemoteUrlFromGitCli(uri: vscode.Uri): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const pathFunctions = pathFunctionsForURI(uri)
    const execPromise = util.promisify(cp.exec)

    try {
        const { stdout: remotes, stderr: remoteUrlError } = await execPromise('git remote -v', {
            cwd: pathFunctions.dirname(uri.fsPath),
        })

        if (remoteUrlError) {
            logDebug('gitRemoteUrlFromGitCli', 'git remote -v failed with:', remoteUrlError)
            return undefined
        }

        let fetchRemote = undefined
        for (const line of remotes.trim().split('\n')) {
            const parts = line.split(/\s+/)
            if (parts[2] === '(push)') {
                return parts[1].trim()
            }

            if (!fetchRemote && parts[2] === '(fetch)') {
                fetchRemote = parts[1].trim()
            }
        }

        return fetchRemote
    } catch (error) {
        if (error instanceof Error) {
            logDebug('gitRemoteUrlFromGitCli', 'not a git repository', { verbose: error })
        }
        return undefined
    }
}

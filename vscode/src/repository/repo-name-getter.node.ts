import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { pathFunctionsForURI } from '@sourcegraph/cody-shared/src/common/path'

const execPromise = promisify(exec)
export async function gitRemoteUrlFromGitCli(
    uri: vscode.Uri,
    remoteName = 'origin'
): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const pathFunctions = pathFunctionsForURI(uri)

    try {
        const { stdout: repoRootPath, stderr: repoRootError } = await execPromise(
            'git rev-parse --show-toplevel',
            { cwd: pathFunctions.dirname(uri.fsPath) }
        )

        if (repoRootError) {
            logDebug('gitRemoteUrlFromGitCli', 'not a git repository', repoRootError)
            return undefined
        }

        const { stdout: remoteUrl, stderr: remoteUrlError } = await execPromise(
            `git remote get-url ${remoteName}`,
            {
                cwd: repoRootPath.trim(),
            }
        )

        if (remoteUrlError) {
            logDebug('gitRemoteUrlFromGitCli', `Git remote ${remoteName} not found`, remoteUrlError)
            return undefined
        }

        return remoteUrl.trim()
    } catch (error) {
        if (error instanceof Error) {
            logDebug('gitRemoteUrlFromGitCli', 'not a git repository', { verbose: error })
        }
        return undefined
    }
}

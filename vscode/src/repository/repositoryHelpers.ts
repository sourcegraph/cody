import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import ini from 'ini'
import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName, ignores, isFileURI } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { pathFunctionsForURI } from '@sourcegraph/cody-shared/src/common/path'
import { LRUCache } from 'lru-cache'
import { TestSupport } from '../test-support'
import type { API, GitExtension } from './builtinGitExtension'

export function gitAPI(): API | undefined {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    if (!extension) {
        console.warn('Git extension not available')
        return undefined
    }
    if (!extension.isActive) {
        console.warn('Git extension not active')
        return undefined
    }

    return extension.exports.getAPI(1)
}

/**
 * NOTE: This is for Chat and Commands where we use the git extension to get the codebase name.
 *
 * Initializes the Git API by activating the Git extension and getting the API instance.
 * Also sets up the .codyignore handler.
 */
let vscodeGitAPI: API | undefined
export async function gitAPIinit(): Promise<vscode.Disposable> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    // Initializes the Git API by activating the Git extension and getting the API instance.
    // Sets up the .codyignore handler.
    function init(): void {
        if (!vscodeGitAPI && extension?.isActive) {
            if (TestSupport.instance) {
                TestSupport.instance.ignoreHelper.set(ignores)
            }
            // This throws error if the git extension is disabled
            vscodeGitAPI = extension.exports?.getAPI(1)
        }
    }
    // Initialize the git extension if it is available
    try {
        await extension?.activate().then(() => init())
    } catch (error) {
        vscodeGitAPI = undefined
        // Display error message if git extension is disabled
        const errorMessage = `${error}`
        if (extension?.isActive && errorMessage.includes('Git model not found')) {
            console.warn(
                'Git extension is not available. Please ensure it is enabled for Cody to work properly.'
            )
        }
    }
    // Update vscodeGitAPI when the extension becomes enabled/disabled
    return {
        dispose() {
            extension?.exports?.onDidChangeEnablement(enabled => {
                if (enabled) {
                    return init()
                }
                vscodeGitAPI = undefined
            })
        },
    }
}

/**
 * Gets the codebase name from a workspace / file URI.
 *
 * Checks if the Git API is initialized, initializes it if not.
 * Gets the Git repository for the given URI.
 * If found, gets the codebase name from the repository.
 * Returns the codebase name, or undefined if not found.
 */
export function getCodebaseFromWorkspaceUri(uri: vscode.Uri): string | undefined {
    try {
        const remoteOriginUrl = gitRemoteUrlFromGitExtension(uri)
        if (remoteOriginUrl) {
            return convertGitCloneURLToCodebaseName(remoteOriginUrl) || undefined
        }
    } catch (error) {
        logDebug('repositoryHelper:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
    }
    return undefined
}

type FsPath = string
type RepoName = string
const fsPathToRepoNameCache = new LRUCache<FsPath, RepoName>({ max: 1000 })

/**
 * Gets the codebase name from a workspace / file URI.
 *
 * Checks if the Git API is initialized, initializes it if not.
 * Gets the Git repository for the given URI.
 * If found, gets the codebase name from the repository.
 * If not found, attempts to use Git CLI to get the codebase name.
 * if not found, walks the file system upwards until it finds a.git folder.
 * If not found, returns undefined.
 */
export async function getCodebaseFromWorkspaceUriAsync(uri: vscode.Uri): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    if (fsPathToRepoNameCache.has(uri.fsPath)) {
        return fsPathToRepoNameCache.get(uri.fsPath)
    }

    try {
        let remoteOriginUrl = gitRemoteUrlFromGitExtension(uri)

        if (!remoteOriginUrl) {
            remoteOriginUrl = await gitRemoteUrlFromGitCli(uri)
        }

        if (!remoteOriginUrl) {
            remoteOriginUrl = await gitRemoteUrlFromTreeWalk(uri)
        }

        if (remoteOriginUrl) {
            const repoName = convertGitCloneURLToCodebaseName(remoteOriginUrl) || undefined
            fsPathToRepoNameCache.set(uri.fsPath, repoName)

            return repoName
        }
    } catch (error) {
        logDebug('repositoryHelper:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
    }
    return undefined
}

function gitRemoteUrlFromGitExtension(uri: vscode.Uri, remoteName = 'origin'): string | undefined {
    const repository = vscodeGitAPI?.getRepository(uri)
    return repository?.state.remotes[0]?.pushUrl || repository?.state.remotes[0]?.fetchUrl
}

const execPromise = promisify(exec)
async function gitRemoteUrlFromGitCli(
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

const textDecoder = new TextDecoder('utf-8')
async function gitRemoteUrlFromTreeWalk(
    uri: vscode.Uri,
    remoteName = 'origin'
): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const gitConfigUri = vscode.Uri.joinPath(uri, '.git', 'config')

    try {
        const raw = await vscode.workspace.fs.readFile(gitConfigUri)
        const configContents = textDecoder.decode(raw)
        const config = ini.parse(configContents)

        return config[`remote "${remoteName}"`]?.url
    } catch (error) {
        const parentPath = vscode.Uri.joinPath(uri, '..')
        if (parentPath.fsPath === uri.fsPath) {
            return undefined
        }

        return gitRemoteUrlFromTreeWalk(parentPath)
    }
}

import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/src/utils'

import { logDebug } from '../log'
import { setUpCodyIgnore, updateCodyIgnoreCodespaceMap } from '../services/context-filter'

import { API, GitExtension, Repository } from './builtinGitExtension'

export function repositoryRemoteUrl(uri: vscode.Uri): string | undefined {
    return gitRepositoryRemoteUrl(uri) ?? undefined
}

export function gitDirectoryUri(uri: vscode.Uri): vscode.Uri | undefined {
    return gitAPI()?.getRepository(uri)?.rootUri
}

function gitRepositoryRemoteUrl(uri: vscode.Uri): string | undefined {
    try {
        const git = gitAPI()
        const repository = git?.getRepository(uri)
        if (!repository) {
            console.warn(`No Git repository for URI ${uri}`)
            return undefined
        }

        return repository.state.remotes[0]?.fetchUrl
    } catch (error) {
        logDebug('repositoryHelper:gitRepositoryRemoteUrl', 'error', { verbose: error })
        return undefined
    }
}

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
export async function gitAPIinit(): Promise<vscode.Disposable | undefined> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    // Initializes the Git API by activating the Git extension and getting the API instance.
    // Sets up the .codyignore handler.
    function init(): void {
        if (!vscodeGitAPI && extension?.isActive) {
            setUpCodyIgnore()
            // This throws error if the git extension is disabled
            vscodeGitAPI = extension.exports?.getAPI(1)
            getAllCodebasesInWorkspace().map(result => updateCodyIgnoreCodespaceMap(result.codebase, result.ws))
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
            console.warn('Git extension is not available. Please ensure it is enabled for Cody to work properly.')
        }
    }
    // Update vscodeGitAPI when the extension becomes enabled/disabled
    return extension?.exports?.onDidChangeEnablement(enabled => {
        if (enabled) {
            return init()
        }
        vscodeGitAPI = undefined
    })
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
        const repository = vscodeGitAPI?.getRepository(uri)
        if (repository) {
            return getCodebaseNameFromGitRepo(repository)
        }
    } catch (error) {
        logDebug('repositoryHelper:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
    }
    return undefined
}

/**
 * Gets a list of all codebases in the current workspace by iterating through
 * the Git repositories and extracting the codebase name from each one.
 *
 * Checks if the Git API is initialized and initializes it if needed.
 * Gets a list of all Git repositories in the workspace.
 * For each repository, extracts the workspace root path and codebase name.
 * If both are present, adds them to the result array.
 * Catches and logs any errors.
 *
 * Returns an array of objects containing the workspace root path and
 * codebase name for each repository.
 */
export function getAllCodebasesInWorkspace(): { ws: string; codebase: string }[] {
    const matches = []
    try {
        const repositories = vscodeGitAPI?.repositories || []
        for (const repository of repositories) {
            const workspaceRoot = repository.rootUri.fsPath
            const codebaseName = getCodebaseNameFromGitRepo(repository)
            if (workspaceRoot && codebaseName) {
                if (codebaseName) {
                    matches.push({ ws: workspaceRoot, codebase: codebaseName })
                }
            }
        }
    } catch (error) {
        logDebug('repositoryHelper:getAllCodebasesInWorkspace', 'error', { verbose: error })
    }
    return matches
}

// HELPER FUNCTIONS
function getCodebaseNameFromGitRepo(repository: Repository): string | undefined {
    const remoteUrl = repository.state.remotes[0]?.pushUrl || repository.state.remotes[0]?.fetchUrl
    if (!remoteUrl) {
        return undefined
    }
    return convertGitCloneURLToCodebaseName(remoteUrl) || undefined
}

import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/src/utils'

import { logDebug } from '../log'
import { setUpCodyIgnore } from '../services/context-filter'

import { type API, type GitExtension, type Repository } from './builtinGitExtension'

export function gitDirectoryUri(uri: vscode.Uri): vscode.Uri | undefined {
    return gitAPI()?.getRepository(uri)?.rootUri
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

// HELPER FUNCTIONS
function getCodebaseNameFromGitRepo(repository: Repository): string | undefined {
    const remoteUrl = repository.state.remotes[0]?.pushUrl || repository.state.remotes[0]?.fetchUrl
    if (!remoteUrl) {
        return undefined
    }
    return convertGitCloneURLToCodebaseName(remoteUrl) || undefined
}

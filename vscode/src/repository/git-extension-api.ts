import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName, ignores } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

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
        const remoteUrl = gitRemoteUrlFromGitExtension(uri)
        if (remoteUrl) {
            return convertGitCloneURLToCodebaseName(remoteUrl) || undefined
        }
    } catch (error) {
        logDebug('repositoryHelper:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
    }
    return undefined
}

export function gitRemoteUrlFromGitExtension(uri: vscode.Uri): string | undefined {
    const repository = vscodeGitAPI?.getRepository(uri)
    return repository?.state.remotes[0]?.pushUrl || repository?.state.remotes[0]?.fetchUrl
}

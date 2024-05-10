import * as vscode from 'vscode'

import type { API, GitExtension } from './builtinGitExtension'

/**
 * ❗️ The Git extension API instance is only available in the VS Code extension. ️️❗️
 *
 * Product features dependent on the Git information need to implement Git-extension-agnostic helpers
 * similar to {@link RepoNameResolver.getRepoRemoteUrlsFromWorkspaceUri} to enable the same behavior in the agent.
 */
export let vscodeGitAPI: API | undefined
const GIT_EXTENSION_API_VERSION = 1

/**
 * Initializes the Git API by activating the Git extension and getting the API instance.
 */
export async function initVSCodeGitApi(): Promise<vscode.Disposable> {
    // Should be available in the VS Code extension because of `"extensionDependencies": ["vscode.git"]`.
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')

    if (vscodeGitAPI) {
        throw new Error('Git API already initialized')
    }

    // Initialize the git extension if it is available
    try {
        if (!gitExtension?.isActive) {
            await gitExtension?.activate()
        }

        // This throws error if the git extension is disabled
        vscodeGitAPI = gitExtension?.exports?.getAPI(GIT_EXTENSION_API_VERSION)
    } catch (error) {
        // Display error message if git extension is disabled
        if (gitExtension?.isActive && `${error}`.includes('Git model not found')) {
            console.warn(
                'Git extension is not available. Please ensure it is enabled for Cody to work properly.'
            )
        }
    }

    // Update vscodeGitAPI when the extension becomes enabled/disabled
    return {
        dispose() {
            gitExtension?.exports?.onDidChangeEnablement(isEnabled => {
                vscodeGitAPI = isEnabled
                    ? gitExtension.exports?.getAPI(GIT_EXTENSION_API_VERSION)
                    : undefined
            })
        },
    }
}

/**
 * ❗️ The Git extension API instance is only available in the VS Code extension. ️️❗️
 */
export function gitRemoteUrlsFromGitExtension(uri: vscode.Uri): string[] | undefined {
    const repository = vscodeGitAPI?.getRepository(uri)
    const remoteUrls = new Set<string>()

    for (const remote of repository?.state?.remotes || []) {
        if (remote.fetchUrl) {
            remoteUrls.add(remote.fetchUrl)
        }

        if (remote.pushUrl) {
            remoteUrls.add(remote.pushUrl)
        }
    }

    return remoteUrls.size ? Array.from(remoteUrls) : undefined
}

/**
 * ❗️ The Git extension API instance is only available in the VS Code extension. ️️❗️
 * TODO: implement agent support in https://github.com/sourcegraph/cody/issues/4139
 */
export function gitCommitIdFromGitExtension(uri: vscode.Uri): string | undefined {
    const repository = vscodeGitAPI?.getRepository(uri)
    return repository?.state?.HEAD?.commit
}

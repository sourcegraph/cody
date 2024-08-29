import * as vscode from 'vscode'
import { logDebug } from '../log'
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
 * Gets the list of locally modified files in the Git repository for the given URI.
 * This is defined as the list of files modified since the merge base of the current
 * branch with its upstream. If the upstream doesn't exist, then we use the list of
 * files modified since the last commit.
 *
 * If the uri is not part of a Git repository, this method returns an empty array.
 */
export async function gitLocallyModifiedFiles(uri: vscode.Uri, signal?: AbortSignal): Promise<string[]> {
    const repo = vscodeGitAPI?.getRepository(uri)
    if (!repo) {
        logDebug('gitLocallyModifiedFiles', 'no git repository found at', uri.toString())
        return []
    }

    if (!repo.state.HEAD?.commit) {
        logDebug('gitLocallyModifiedFiles', 'HEAD commit was undefined for git repo at', uri.toString())
        return []
    }
    let diffBase = repo.state.HEAD.commit
    if (repo.state.HEAD?.upstream) {
        diffBase = await repo.getMergeBase(
            `${repo.state.HEAD.upstream.remote}/${repo.state.HEAD.upstream.name}`,
            repo.state.HEAD.commit
        )
        signal?.throwIfAborted()
    }

    const changes = await repo?.diffWith(diffBase)
    signal?.throwIfAborted()
    const modifiedFileURIs = changes.map(change => change.renameUri ?? change.uri)

    return modifiedFileURIs.map(u => u.fsPath)
}

/**
 * ❗️ The Git extension API instance is only available in the VS Code extension. ️️❗️
 * TODO: implement agent support in https://github.com/sourcegraph/cody/issues/4139
 */
export function gitCommitIdFromGitExtension(uri: vscode.Uri): string | undefined {
    const repository = vscodeGitAPI?.getRepository(uri)
    return repository?.state?.HEAD?.commit
}

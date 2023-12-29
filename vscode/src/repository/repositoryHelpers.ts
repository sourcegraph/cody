import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared/src/utils'

import { logDebug } from '../log'
import { setUpCodyIgnore } from '../services/context-filter'

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
        console.error(error)
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

let vscodeGitAPI: API | undefined
export async function gitAPIinit(): Promise<void> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
    extension?.exports.onDidChangeEnablement(enabled => {
        vscodeGitAPI = enabled ? extension.exports.getAPI(1) : undefined
    })
    // Set codyignore list on git extension startup
    await extension?.activate().then(() => setUpCodyIgnore())
    vscodeGitAPI = extension?.exports?.getAPI(1)
}

// Git Remote URL <> Codebase name
export function getCodebaseFromWorkspaceUri(uri: vscode.Uri): string | undefined {
    if (!vscodeGitAPI) {
        gitAPIinit().catch(error => console.error(error))
    }
    try {
        const repository = vscodeGitAPI?.getRepository(uri)
        if (repository) {
            return getCodebaseFromRepo(repository)
        }
    } catch (error) {
        logDebug('repositoryHelper:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
    }
    return undefined
}

export function getAllCodebasesInWorkspace(): { ws: string; codebase: string }[] {
    if (!vscodeGitAPI) {
        gitAPIinit().catch(error => console.error(error))
    }
    const matches = []
    try {
        const repositories = vscodeGitAPI?.repositories || []
        for (const repository of repositories) {
            const workspaceRoot = repository.rootUri.fsPath
            const codebaseName = getCodebaseFromRepo(repository)
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

function getCodebaseFromRepo(repository: Repository): string | undefined {
    const remoteUrl = repository.state.remotes[0]?.pushUrl || repository.state.remotes[0]?.fetchUrl
    if (!remoteUrl) {
        return undefined
    }
    return convertGitCloneURLToCodebaseName(remoteUrl) || undefined
}

export function getGitRepository(uri: vscode.Uri): Repository | undefined {
    return vscodeGitAPI?.getRepository(uri) || undefined
}

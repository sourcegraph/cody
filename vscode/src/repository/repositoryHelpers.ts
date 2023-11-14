import * as vscode from 'vscode'

import { API, GitExtension } from './builtinGitExtension'

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
            console.warn('No Git repository for URI', uri)
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

import * as vscode from 'vscode'

import { GitExtension } from './builtinGitExtension'

export function repositoryRemoteUrl(uri: vscode.Uri): string | undefined {
    return gitRepositoryRemoteUrl(uri) ?? undefined
}

function gitRepositoryRemoteUrl(uri: vscode.Uri): string | undefined {
    try {
        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
        if (!extension) {
            console.warn('Git extension not available')
            return undefined
        }
        if (!extension.isActive) {
            console.warn('Git extension not active')
            return undefined
        }

        const git = extension.exports.getAPI(1)
        const repository = git.getRepository(uri)
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

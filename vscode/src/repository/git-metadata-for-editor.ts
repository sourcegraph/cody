import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { getEditor } from '../editor/active-editor'
import { repoNameResolver } from '../repository/repo-name-resolver'
import { gitCommitIdFromGitExtension } from './git-extension-api'

export interface GitIdentifiersForFile {
    fileName: vscode.Uri
    remote?: string
    commit?: string
}

export interface GitIdentifiersForRepo {
    remote?: string
    commit?: string
}

class GitMetadataForCurrentEditor implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private gitIdentifiersForFile: GitIdentifiersForFile | undefined = undefined

    constructor() {
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => this.updateStatus()))
    }

    public getGitIdentifiersForFile(): GitIdentifiersForFile | undefined {
        if (this.gitIdentifiersForFile === undefined) {
            this.updateStatus()
        }
        return this.gitIdentifiersForFile
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
    }

    private async updateStatus() {
        let newGitIdentifiersForFile: GitIdentifiersForFile | undefined = undefined

        const config = getConfiguration()
        const currentFile = getEditor()?.active?.document?.uri
        const remote =
            config.codebase ||
            (currentFile
                ? (await repoNameResolver.getRepoNamesFromWorkspaceUri(currentFile))[0]
                : config.codebase)
        if (currentFile) {
            const commit = gitCommitIdFromGitExtension(currentFile)
            newGitIdentifiersForFile = {
                fileName: currentFile,
                remote: remote,
                commit: commit,
            }
        }
        this.gitIdentifiersForFile = newGitIdentifiersForFile
    }
}

export const gitMetadataForCurrentEditor = new GitMetadataForCurrentEditor()

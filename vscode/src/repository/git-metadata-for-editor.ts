import { displayPathWithoutWorkspaceFolderPrefix } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { getEditor } from '../editor/active-editor'
import { repoNameResolver } from '../repository/repo-name-resolver'
import { gitCommitIdFromGitExtension } from './git-extension-api'

export interface GitIdentifiersForFile {
    filePath?: string
    repoName?: string
    commit?: string
}

class GitMetadataForCurrentEditor {
    private gitIdentifiersForFile: GitIdentifiersForFile | undefined = undefined

    constructor() {
        vscode.window.onDidChangeActiveTextEditor(() => this.updateStatus())
    }

    public getGitIdentifiersForFile(): GitIdentifiersForFile | undefined {
        if (this.gitIdentifiersForFile === undefined) {
            this.updateStatus().catch(() => {})
        }
        return this.gitIdentifiersForFile
    }

    private async updateStatus(): Promise<void> {
        let newGitIdentifiersForFile: GitIdentifiersForFile | undefined = undefined

        const config = getConfiguration()
        const currentFile = getEditor()?.active?.document?.uri
        if (currentFile) {
            const repoName =
                config.codebase ??
                (currentFile
                    ? (await repoNameResolver.getRepoNamesContainingUri(currentFile)).at(0)
                    : config.codebase)

            const commit = gitCommitIdFromGitExtension(currentFile)
            newGitIdentifiersForFile = {
                filePath: displayPathWithoutWorkspaceFolderPrefix(currentFile),
                repoName,
                commit: commit,
            }
        }
        this.gitIdentifiersForFile = newGitIdentifiersForFile
    }
}

export const gitMetadataForCurrentEditor = new GitMetadataForCurrentEditor()

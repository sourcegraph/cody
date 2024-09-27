import {
    convertGitCloneURLToCodebaseName,
    displayPathWithoutWorkspaceFolderPrefix,
    firstResultFromOperation,
} from '@sourcegraph/cody-shared'
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

export function fakeGitURLFromCodebase(codebaseName: string | undefined): string | undefined {
    if (!codebaseName) {
        return undefined
    }
    try {
        return new URL(codebaseName).toString()
    } catch (error) {
        // Convert a codebase name like example.com/foo/bar to git@example.com:foo/bar
        // Of course, this may not be the actual remote but it is the best we can do.
        const slash = codebaseName.indexOf('/')
        return `git@${codebaseName.slice(0, slash)}:${codebaseName.slice(slash + 1)}`
    }
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
            let repoName: string | undefined
            if (config.codebase) {
                const codebaseUrl = fakeGitURLFromCodebase(config.codebase)
                if (codebaseUrl) {
                    repoName = convertGitCloneURLToCodebaseName(codebaseUrl) ?? undefined
                }
            }
            if (!repoName) {
                repoName = currentFile
                    ? (
                          await firstResultFromOperation(
                              repoNameResolver.getRepoNamesContainingUri(currentFile)
                          )
                      ).at(0)
                    : undefined
            }

            const commit = gitCommitIdFromGitExtension(currentFile)
            newGitIdentifiersForFile = {
                filePath: displayPathWithoutWorkspaceFolderPrefix(currentFile),
                repoName,
                commit,
            }
        }
        this.gitIdentifiersForFile = newGitIdentifiersForFile
    }
}

export const gitMetadataForCurrentEditor = new GitMetadataForCurrentEditor()

import { convertGitCloneURLToCodebaseName } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getConfiguration } from '../configuration'
import { getEditor } from '../editor/active-editor'
import { repoNameResolver } from '../repository/repo-name-resolver'
import { gitCommitIdFromGitExtension } from './git-extension-api'

export interface GitIdentifiersForFile {
    filePath?: string
    gitUrl?: string
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
            this.updateStatus()
        }
        return this.gitIdentifiersForFile
    }

    private async updateStatus() {
        let newGitIdentifiersForFile: GitIdentifiersForFile | undefined = undefined

        const config = getConfiguration()
        const currentFile = getEditor()?.active?.document?.uri
        const remoteGitUrl =
            fakeGitURLFromCodebase(config.codebase) ||
            (currentFile
                ? (await repoNameResolver.getRepoRemoteUrlsFromWorkspaceUri(currentFile))[0]
                : fakeGitURLFromCodebase(config.codebase))

        const gitUrl = remoteGitUrl
            ? convertGitCloneURLToCodebaseName(remoteGitUrl) || undefined
            : undefined
        if (currentFile) {
            const commit = gitCommitIdFromGitExtension(currentFile)
            newGitIdentifiersForFile = {
                filePath: currentFile.fsPath,
                gitUrl: gitUrl,
                commit: commit,
            }
        }
        this.gitIdentifiersForFile = newGitIdentifiersForFile
    }
}

export const gitMetadataForCurrentEditor = new GitMetadataForCurrentEditor()

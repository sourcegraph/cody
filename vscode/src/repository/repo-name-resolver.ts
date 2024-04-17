import ini from 'ini'
import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName, isFileURI } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { LRUCache } from 'lru-cache'
import { gitRemoteUrlFromGitExtension } from './git-extension-api'

export type RemoteUrlGetter = (uri: vscode.Uri) => Promise<string | undefined>
type FsPath = string
type RepoName = string

export class RepoNameResolver {
    private platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []
    private fsPathToRepoNameCache = new LRUCache<FsPath, RepoName>({ max: 1000 })

    /**
     * Currently is used to set node specific remote url getters on the extension init.
     */
    public init(platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []) {
        this.platformSpecificGitRemoteGetters = platformSpecificGitRemoteGetters
    }

    /**
     * Gets the codebase name from a workspace / file URI.
     *
     * Checks if the Git API is initialized, initializes it if not.
     * If found, gets the codebase name from the repository.
     * If not found, attempts to use Git CLI to get the codebase name (in node.js environment only).
     * if not found, walks the file system upwards until it finds a `.git` folder.
     * If not found, returns `undefined`.
     */
    public async getRepoNameFromWorkspaceUri(uri: vscode.Uri): Promise<string | undefined> {
        if (!isFileURI(uri)) {
            return undefined
        }

        if (this.fsPathToRepoNameCache.has(uri.fsPath)) {
            return this.fsPathToRepoNameCache.get(uri.fsPath)
        }

        try {
            let remoteOriginUrl = gitRemoteUrlFromGitExtension(uri)

            if (!remoteOriginUrl) {
                remoteOriginUrl = await gitRemoteUrlFromTreeWalk(uri)
            }

            if (!remoteOriginUrl) {
                for (const getter of this.platformSpecificGitRemoteGetters) {
                    remoteOriginUrl = await getter(uri)

                    if (remoteOriginUrl) {
                        break
                    }
                }
            }

            if (remoteOriginUrl) {
                const repoName = convertGitCloneURLToCodebaseName(remoteOriginUrl) || undefined
                this.fsPathToRepoNameCache.set(uri.fsPath, repoName)

                return repoName
            }
        } catch (error) {
            logDebug('RepoNameResolver:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
        }
        return undefined
    }
}

const textDecoder = new TextDecoder('utf-8')

/**
 * Walks the tree from the current directory to find the `.git` folder and
 * extracts remote URL. Prioritizes `pushurl` over `fetchurl` and `url` defined
 * in `.git/config`.
 */
export async function gitRemoteUrlFromTreeWalk(uri: vscode.Uri): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const isFile = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.File
    const dirUri = isFile ? vscode.Uri.joinPath(uri, '..') : uri

    return gitRemoteUrlFromTreeWalkRecursive(dirUri)
}

async function gitRemoteUrlFromTreeWalkRecursive(uri: vscode.Uri): Promise<string | undefined> {
    const gitConfigUri = await resolveGitConfigUri(uri)
    if (!gitConfigUri) {
        const parentUri = vscode.Uri.joinPath(uri, '..')
        if (parentUri.fsPath === uri.fsPath) {
            return undefined
        }

        return gitRemoteUrlFromTreeWalkRecursive(parentUri)
    }

    try {
        const raw = await vscode.workspace.fs.readFile(gitConfigUri)
        const configContents = textDecoder.decode(raw)
        const config = ini.parse(configContents)

        let remoteFetchUrl: string | undefined = undefined
        let remoteUrl: string | undefined = undefined

        for (const [key, value] of Object.entries(config)) {
            if (key.startsWith('remote ')) {
                if (value?.pushurl) {
                    return value.pushurl.trim()
                }

                if (!remoteFetchUrl && value?.fetchurl) {
                    remoteFetchUrl = value.fetchurl
                } else if (!remoteUrl && value.url) {
                    remoteUrl = value.url
                }
            }
        }

        return remoteFetchUrl || remoteUrl
    } catch (error) {
        if (error instanceof vscode.FileSystemError) {
            return undefined
        }

        throw error
    }
}

/**
 * Reads the .git directory or file to determine the path to the git config.
 */
async function resolveGitConfigUri(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const gitPathUri = vscode.Uri.joinPath(uri, '.git')

    try {
        const gitPathStat = await vscode.workspace.fs.stat(gitPathUri)

        if (gitPathStat.type === vscode.FileType.Directory) {
            return vscode.Uri.joinPath(gitPathUri, 'config')
        }

        if (gitPathStat.type === vscode.FileType.File) {
            const rawGitPath = await vscode.workspace.fs.readFile(gitPathUri)
            const submoduleGitDir = textDecoder.decode(rawGitPath).trim().replace('gitdir: ', '')

            return vscode.Uri.joinPath(uri, submoduleGitDir, 'config')
        }

        return undefined
    } catch (error) {
        if (error instanceof vscode.FileSystemError) {
            return undefined
        }

        throw error
    }
}

/**
 * A a singleton instance of the RepoNameResolver class.
 * `repoNameResolver.init` is called on extension activation to set platform specific remote url getters.
 */
export const repoNameResolver = new RepoNameResolver()

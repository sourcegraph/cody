import ini from 'ini'
import * as vscode from 'vscode'

import {
    convertGitCloneURLToCodebaseName,
    graphqlClient,
    isDefined,
    isFileURI,
} from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { LRUCache } from 'lru-cache'
import { gitRemoteUrlsFromGitExtension } from './git-extension-api'

export type RemoteUrlGetter = (uri: vscode.Uri) => Promise<string[] | undefined>
type RepoName = string
type RemoteUrl = string

export class RepoNameResolver {
    private platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []
    private fsPathToRepoNameCache = new LRUCache<RepoName, string[]>({ max: 1000 })
    private remoteUrlToRepoNameCache = new LRUCache<RemoteUrl, Promise<string | null>>({ max: 1000 })

    /**
     * Currently is used to set node specific remote url getters on the extension init.
     */
    public init(platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []) {
        this.platformSpecificGitRemoteGetters = platformSpecificGitRemoteGetters
    }

    /**
     * Gets the repo names for a file URI.
     *
     * Checks if the Git API is initialized, initializes it if not.
     * If found, gets repo names from the repository.
     * if not found, walks the file system upwards until it finds a `.git` folder.
     * If not found, attempts to use Git CLI to get the repo names (in node.js environment only).
     * If not found, returns `undefined`.
     */
    public async getRepoNamesFromWorkspaceUri(uri: vscode.Uri): Promise<string[]> {
        if (!isFileURI(uri)) {
            return []
        }

        if (this.fsPathToRepoNameCache.has(uri.fsPath)) {
            return this.fsPathToRepoNameCache.get(uri.fsPath)!
        }

        try {
            let remoteUrls = gitRemoteUrlsFromGitExtension(uri)

            if (remoteUrls?.length === 0) {
                remoteUrls = await gitRemoteUrlsFromTreeWalk(uri)
            }

            if (remoteUrls === undefined || remoteUrls.length === 0) {
                for (const getter of this.platformSpecificGitRemoteGetters) {
                    remoteUrls = await getter(uri)

                    if (remoteUrls?.length !== 0) {
                        break
                    }
                }
            }

            if (remoteUrls) {
                const uniqueRemoteUrls = Array.from(new Set(remoteUrls))
                const repoNames = await Promise.all(
                    uniqueRemoteUrls.map(remoteUrl => {
                        return this.resolveRepoNameForRemoteUrl(remoteUrl)
                    })
                )

                const definedRepoNames = repoNames.filter(isDefined)
                this.fsPathToRepoNameCache.set(uri.fsPath, definedRepoNames)

                return definedRepoNames
            }
        } catch (error) {
            logDebug('RepoNameResolver:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
        }

        return []
    }

    private async resolveRepoNameForRemoteUrl(remoteUrl: string): Promise<string | null> {
        if (this.remoteUrlToRepoNameCache.has(remoteUrl)) {
            return this.remoteUrlToRepoNameCache.get(remoteUrl)!
        }

        const repoNameRequest = graphqlClient.getRepoName(remoteUrl).then(repoName => {
            if (repoName === null) {
                return convertGitCloneURLToCodebaseName(remoteUrl)
            }
            return repoName
        })
        this.remoteUrlToRepoNameCache.set(remoteUrl, repoNameRequest)

        return repoNameRequest
    }
}

const textDecoder = new TextDecoder('utf-8')

/**
 * Walks the tree from the current directory to find the `.git` folder and
 * extracts remote URLs.
 */
export async function gitRemoteUrlsFromTreeWalk(uri: vscode.Uri): Promise<string[] | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const isFile = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.File
    const dirUri = isFile ? vscode.Uri.joinPath(uri, '..') : uri

    return gitRemoteUrlsFromTreeWalkRecursive(dirUri)
}

async function gitRemoteUrlsFromTreeWalkRecursive(uri: vscode.Uri): Promise<string[] | undefined> {
    const gitConfigUri = await resolveGitConfigUri(uri)

    if (!gitConfigUri) {
        const parentUri = vscode.Uri.joinPath(uri, '..')
        if (parentUri.fsPath === uri.fsPath) {
            return undefined
        }

        return gitRemoteUrlsFromTreeWalkRecursive(parentUri)
    }

    try {
        const raw = await vscode.workspace.fs.readFile(gitConfigUri)
        const configContents = textDecoder.decode(raw)
        const config = ini.parse(configContents)
        const remoteUrls = new Set<string>()

        for (const [key, value] of Object.entries(config)) {
            if (key.startsWith('remote ')) {
                if (value?.pushurl) {
                    remoteUrls.add(value.pushurl)
                }

                if (value?.fetchurl) {
                    remoteUrls.add(value.fetchurl)
                }

                if (value?.url) {
                    remoteUrls.add(value.url)
                }
            }
        }

        return remoteUrls.size ? Array.from(remoteUrls) : undefined
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

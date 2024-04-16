import ini from 'ini'
import * as vscode from 'vscode'

import { convertGitCloneURLToCodebaseName, isFileURI } from '@sourcegraph/cody-shared'

import { logDebug } from '../log'

import { LRUCache } from 'lru-cache'
import { gitRemoteUrlFromGitExtension } from './git-extension-api'

type FsPath = string
type RepoName = string
const fsPathToRepoNameCache = new LRUCache<FsPath, RepoName>({ max: 1000 })

export type RemoteUrlGetter = (uri: vscode.Uri) => Promise<string | undefined>

export class RepoNameResolver {
    private platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []

    public init(platformSpecificGitRemoteGetters: RemoteUrlGetter[] = []) {
        this.platformSpecificGitRemoteGetters = platformSpecificGitRemoteGetters
    }

    /**
     * Gets the codebase name from a workspace / file URI.
     *
     * Checks if the Git API is initialized, initializes it if not.
     * Gets the Git repository for the given URI.
     * If found, gets the codebase name from the repository.
     * If not found, attempts to use Git CLI to get the codebase name (in node.js environment only).
     * if not found, walks the file system upwards until it finds a.git folder.
     * If not found, returns undefined.
     */
    public async getRepoNameFromWorkspaceUri(uri: vscode.Uri): Promise<string | undefined> {
        if (!isFileURI(uri)) {
            return undefined
        }

        if (fsPathToRepoNameCache.has(uri.fsPath)) {
            return fsPathToRepoNameCache.get(uri.fsPath)
        }

        try {
            let remoteOriginUrl = gitRemoteUrlFromGitExtension(uri)

            if (!remoteOriginUrl) {
                for (const getter of this.platformSpecificGitRemoteGetters) {
                    remoteOriginUrl = await getter(uri)

                    if (remoteOriginUrl) {
                        break
                    }
                }
            }

            if (!remoteOriginUrl) {
                remoteOriginUrl = await gitRemoteUrlFromTreeWalk(uri)
            }

            if (remoteOriginUrl) {
                const repoName = convertGitCloneURLToCodebaseName(remoteOriginUrl) || undefined
                fsPathToRepoNameCache.set(uri.fsPath, repoName)

                return repoName
            }
        } catch (error) {
            logDebug('RepoNameResolver:getCodebaseFromWorkspaceUri', 'error', { verbose: error })
        }
        return undefined
    }
}

const textDecoder = new TextDecoder('utf-8')

export async function gitRemoteUrlFromTreeWalk(uri: vscode.Uri): Promise<string | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const gitConfigUri = vscode.Uri.joinPath(uri, '.git', 'config')

    try {
        const raw = await vscode.workspace.fs.readFile(gitConfigUri)
        const configContents = textDecoder.decode(raw)
        const config = ini.parse(configContents)

        const remoteEntry = Object.entries(config).find(([key, value]) => {
            return key.startsWith('remote ') && value?.url
        })

        return remoteEntry?.[1]?.url
    } catch (error) {
        const parentPath = vscode.Uri.joinPath(uri, '..')
        if (parentPath.fsPath === uri.fsPath) {
            return undefined
        }

        return gitRemoteUrlFromTreeWalk(parentPath)
    }
}

/**
 * A a singleton instance of the RepoNameResolver class.
 * `repoNameResolver.init` is called on extension activation to set platform specific remote url getters.
 */
export const repoNameResolver = new RepoNameResolver()

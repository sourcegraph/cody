import ini from 'ini'
import * as vscode from 'vscode'

import { isFileURI } from '@sourcegraph/cody-shared'

const textDecoder = new TextDecoder('utf-8')

/**
 * Walks the tree from the current directory to find the `.git` folder and
 * extracts remote URLs.
 */
export async function gitRemoteUrlsFromParentDirs(
    uri: vscode.Uri,
    signal?: AbortSignal
): Promise<string[] | undefined> {
    if (!isFileURI(uri)) {
        return undefined
    }

    const isFile = (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.File
    const dirUri = isFile ? vscode.Uri.joinPath(uri, '..') : uri

    const gitRepoURIs = await gitRepoURIsFromParentDirs(dirUri, signal)
    return gitRepoURIs
        ? await gitRemoteUrlsFromGitConfigUri(gitRepoURIs.gitConfigUri, signal)
        : undefined
}

interface GitRepoURIs {
    rootUri: vscode.Uri
    gitConfigUri: vscode.Uri
}

async function gitRepoURIsFromParentDirs(
    uri: vscode.Uri,
    signal?: AbortSignal
): Promise<GitRepoURIs | undefined> {
    const gitConfigUri = await resolveGitConfigUri(uri, signal)

    if (!gitConfigUri) {
        const parentUri = vscode.Uri.joinPath(uri, '..')
        if (parentUri.fsPath === uri.fsPath) {
            return undefined
        }

        return await gitRepoURIsFromParentDirs(parentUri, signal)
    }

    return { rootUri: uri, gitConfigUri }
}

async function gitRemoteUrlsFromGitConfigUri(
    gitConfigUri: vscode.Uri,
    signal?: AbortSignal
): Promise<string[] | undefined> {
    try {
        const raw = await vscode.workspace.fs.readFile(gitConfigUri)
        signal?.throwIfAborted()
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
        if (error instanceof Error && 'code' in error) {
            return undefined
        }

        throw error
    }
}

/**
 * Reads the .git directory or file to determine the path to the git config.
 */
async function resolveGitConfigUri(
    uri: vscode.Uri,
    signal?: AbortSignal
): Promise<vscode.Uri | undefined> {
    const gitPathUri = vscode.Uri.joinPath(uri, '.git')

    try {
        const gitPathStat = await vscode.workspace.fs.stat(gitPathUri)
        signal?.throwIfAborted()

        if (gitPathStat.type === vscode.FileType.Directory) {
            return vscode.Uri.joinPath(gitPathUri, 'config')
        }

        if (gitPathStat.type === vscode.FileType.File) {
            const rawGitPath = await vscode.workspace.fs.readFile(gitPathUri)
            signal?.throwIfAborted()
            const submoduleGitDir = textDecoder.decode(rawGitPath).trim().replace('gitdir: ', '')

            return vscode.Uri.joinPath(uri, submoduleGitDir, 'config')
        }

        return undefined
    } catch (error) {
        if (error instanceof Error && 'code' in error) {
            return undefined
        }

        throw error
    }
}

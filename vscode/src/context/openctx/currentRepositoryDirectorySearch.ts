import type { Item, Mention } from '@openctx/client'
import {
    CURRENT_REPOSITORY_DIRECTORY_PROVIDER_URI,
    graphqlClient,
    isDefined,
    isError,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { escapeRegExp } from './remoteFileSearch'

import { getEditor } from '../../editor/active-editor'
import { repoNameResolver } from '../../repository/repo-name-resolver'
import { WorkspaceRepoMapper } from '../workspace-repo-mapper'
import type { OpenCtxProvider } from './types'

const CurrentRepositoryDirectoryProvider = createCurrentRepositoryDirectoryProvider()
function createCurrentRepositoryDirectoryProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: CURRENT_REPOSITORY_DIRECTORY_PROVIDER_URI,

        meta() {
            return {
                name: customTitle ?? 'Directories',
                mentions: {},
            }
        },

        async mentions({ query }) {
            const currentFile = getEditor().active?.document.uri
            const workspace = vscode.workspace.workspaceFolders?.[0].uri

            if (currentFile || workspace) {
                const remote = (
                    await repoNameResolver.getRepoNamesFromWorkspaceUri(
                        (currentFile || workspace) as vscode.Uri
                    )
                )[0]

                if (remote) {
                    const workspaceRepoMapper = new WorkspaceRepoMapper()
                    const currentRepo = await workspaceRepoMapper.repoForCodebase(remote)

                    if (currentRepo) {
                        return await getDirectoryMentions(currentRepo.name, query?.trim())
                    }
                }
            }

            return []
        },

        async items({ mention, message }) {
            if (!mention?.data?.repoID || !mention?.data?.directoryPath || !message) {
                return []
            }

            return await getDirectoryItem(
                message,
                mention.data.repoID as string,
                mention.data.directoryPath as string
            )
        },
    }
}

export async function getDirectoryMentions(
    repoName: string,
    directoryPath?: string
): Promise<Mention[]> {
    const repoRe = `^${escapeRegExp(repoName)}$`
    const directoryRe = directoryPath ? escapeRegExp(directoryPath) : ''
    const query = `repo:${repoRe} file:${directoryRe}.*\/.* select:file.directory count:10`

    const dataOrError = await graphqlClient.searchFileMatches(query)

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.search.results.results
        .map(result => {
            if (result.__typename !== 'FileMatch') {
                return null
            }

            const url = `${graphqlClient.endpoint.replace(/\/$/, '')}${result.file.url}`

            return {
                uri: url,
                title: result.file.path,
                description: '',
                data: {
                    repoName: result.repository.name,
                    repoID: result.repository.id,
                    rev: result.file.commit.oid,
                    directoryPath: result.file.path,
                },
            } satisfies Mention
        })
        .filter(isDefined)
}

export async function getDirectoryItem(
    query: string,
    repoID: string,
    directoryPath: string
): Promise<Item[]> {
    const dataOrError = await graphqlClient.contextSearch({
        repoIDs: [repoID],
        query,
        filePatterns: [directoryPath],
    })

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.map(
        node =>
            ({
                url: node.uri.toString(),
                title: node.path,
                ai: {
                    content: node.content,
                },
            }) as Item
    )
}

export default CurrentRepositoryDirectoryProvider

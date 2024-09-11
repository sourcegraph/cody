import { REMOTE_DIRECTORY_PROVIDER_URI, currentResolvedConfig } from '@sourcegraph/cody-shared'

import type { Item, Mention } from '@openctx/client'
import { graphqlClient, isDefined, isError } from '@sourcegraph/cody-shared'
import { getRepositoryMentions } from './common/get-repository-mentions'
import { escapeRegExp } from './remoteFileSearch'

import type { OpenCtxProvider } from './types'

const RemoteDirectoryProvider = createRemoteDirectoryProvider()

export function createRemoteDirectoryProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: REMOTE_DIRECTORY_PROVIDER_URI,

        meta() {
            return {
                name: customTitle ?? 'Remote Directories',
                mentions: {},
            }
        },

        async mentions({ query }) {
            const [repoName, directoryPath] = query?.split(':') || []

            if (!query?.includes(':') || !repoName.trim()) {
                return await getRepositoryMentions(query?.trim() ?? '', REMOTE_DIRECTORY_PROVIDER_URI)
            }

            return await getDirectoryMentions(repoName, directoryPath.trim())
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

    const {
        auth: { serverEndpoint },
    } = await currentResolvedConfig()
    const dataOrError = await graphqlClient.searchFileMatches(query)

    if (isError(dataOrError) || dataOrError === null) {
        return []
    }

    return dataOrError.search.results.results
        .map(result => {
            if (result.__typename !== 'FileMatch') {
                return null
            }

            const url = `${serverEndpoint.replace(/\/$/, '')}${result.file.url}`

            return {
                uri: url,
                title: result.file.path,
                description: ' ',
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
        filePatterns: [`^${directoryPath}.*`],
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

export default RemoteDirectoryProvider

import type { Item, Mention } from '@openctx/client'
import {
    REMOTE_REPOSITORY_PROVIDER_URI,
    type RepoSearchResponse,
    contextFiltersProvider,
    graphqlClient,
    isError,
} from '@sourcegraph/cody-shared'

import type { OpenCtxProvider } from './types'

const RemoteRepositorySearch: OpenCtxProvider = createRemoteRepositoryProvider()

export function createRemoteRepositoryProvider(customTitle?: string): OpenCtxProvider {
    return {
        providerUri: REMOTE_REPOSITORY_PROVIDER_URI,

        meta() {
            return { name: customTitle ?? 'Remote Repositories', mentions: {} }
        },

        async mentions({ query }) {
            try {
                const dataOrError = await graphqlClient.searchRepos(30, undefined, query)

                if (isError(dataOrError) || dataOrError === null) {
                    return []
                }

                const repositories = dataOrError.repositories.nodes

                return repositories.map(createRemoteRepositoryMention)
            } catch (error) {
                return []
            }
        },

        async items({ message, mention }) {
            if (!mention?.data?.repoId || !message) {
                return []
            }

            const dataOrError = await graphqlClient.contextSearch(
                [mention?.data?.repoId as string],
                message
            )
            if (isError(dataOrError) || dataOrError === null) {
                return []
            }

            return dataOrError.map(
                node =>
                    ({
                        url: graphqlClient.endpoint + node.uri.toString(),
                        title: node.path,
                        ai: {
                            content: node.content,
                        },
                    }) as Item
            )
        },
    }
}

export function createRemoteRepositoryMention(
    repo: RepoSearchResponse['repositories']['nodes'][number]
): Mention & { providerUri: string } {
    return {
        uri: graphqlClient.endpoint + repo.url,
        title: repo.name,
        // By default we show <title> <uri> in the mentions menu.
        // As repo.url and repo.name are almost same, we do not want to show the uri.
        // So that is why we are setting the description to " " string.
        description: ' ',
        data: {
            repoId: repo.id,
            isIgnored: contextFiltersProvider.isRepoNameIgnored(repo.name),
        },
        providerUri: RemoteRepositorySearch.providerUri,
    }
}

export default RemoteRepositorySearch

import { contextFiltersProvider, graphqlClient, isDefined, isError } from '@sourcegraph/cody-shared'

import type { Item, Provider } from '@openctx/client'

const RemoteRepositorySearch: Provider & {
    providerUri: string
} = {
    providerUri: 'internal-remote-repository-search',

    meta() {
        return { name: 'Sourcegraph Repositories', mentions: {} }
    },

    async mentions({ query }) {
        try {
            const dataOrError = await graphqlClient.searchRepos(30, undefined, query)

            if (isError(dataOrError) || dataOrError === null) {
                return []
            }

            const repositories = dataOrError.repositories.nodes

            return repositories
                .map(repo =>
                    contextFiltersProvider.isRepoNameIgnored(repo.name)
                        ? null
                        : {
                              uri: repo.url,
                              title: repo.name,
                              data: {
                                  repoId: repo.id,
                              },
                          }
                )
                .filter(isDefined)
        } catch (error) {
            return []
        }
    },

    async items({ message, mention }) {
        if (!mention?.data?.repoId || !message) {
            return []
        }

        const dataOrError = await graphqlClient.contextSearch(
            new Set([mention?.data?.repoId as string]),
            message
        )
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
    },
}

export default RemoteRepositorySearch

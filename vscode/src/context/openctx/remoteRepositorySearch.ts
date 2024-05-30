import { contextFiltersProvider, graphqlClient, isError } from '@sourcegraph/cody-shared'

import type { Item, Provider } from '@openctx/client'

const RemoteRepositorySearch: Provider & {
    providerUri: string
} = {
    providerUri: 'internal-remote-repository-search',

    meta() {
        return { name: 'Remote Repositories', mentions: {} }
    },

    async mentions({ query }) {
        try {
            const dataOrError = await graphqlClient.searchRepos(30, undefined, query)

            if (isError(dataOrError) || dataOrError === null) {
                return []
            }

            const repositories = dataOrError.repositories.nodes

            return repositories.map(repo => ({
                uri: repo.url,
                title: repo.name,
                // By default we show <title> <uri> in the mentions menu.
                // As repo.url and repo.name are almost same, we do not want to show the uri.
                // So that is why we are setting the description to " " string.
                description: ' ',
                data: {
                    repoId: repo.id,
                    isIgnored: contextFiltersProvider.isRepoNameIgnored(repo.name),
                },
            }))
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

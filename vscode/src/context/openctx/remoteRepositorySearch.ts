import type { Item } from '@openctx/client'
import {
    type InternalOpenCtxProvider,
    type MentionWithContextItemData,
    REMOTE_REPOSITORY_PROVIDER_URI,
    type RepoSearchResponse,
    contextFiltersProvider,
    graphqlClient,
    isError,
} from '@sourcegraph/cody-shared'

const RemoteRepositorySearch: InternalOpenCtxProvider = createRemoteRepositoryProvider()

export function createRemoteRepositoryProvider(customTitle?: string): InternalOpenCtxProvider {
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

                return repositories.map(repo =>
                    createRemoteRepositoryMention(repo, RemoteRepositorySearch.providerUri)
                )
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
    repo: RepoSearchResponse['repositories']['nodes'][number],
    providerUri: string
): MentionWithContextItemData & { providerUri: string } {
    const uri = graphqlClient.endpoint + repo.url
    return {
        uri,
        title: repo.name,
        // By default we show <title> <uri> in the mentions menu.
        // As repo.url and repo.name are almost same, we do not want to show the uri.
        // So that is why we are setting the description to " " string.
        description: ' ',
        data: {
            contextItem: {
                type: 'repository',
                repoID: repo.id,
                repoName: repo.name,
                title: repo.name,
                uri,
                isIgnored: contextFiltersProvider.isRepoNameIgnored(repo.name),
                provider: 'openctx',
                openctxProviderUri: providerUri,
            },
        },
        providerUri,
    }
}

export default RemoteRepositorySearch

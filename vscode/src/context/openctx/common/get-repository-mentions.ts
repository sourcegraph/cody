import type { Mention } from '@openctx/client'
import {
    type AuthCredentials,
    type SuggestionsRepo,
    contextFiltersProvider,
    currentResolvedConfig,
    graphqlClient,
    isError,
} from '@sourcegraph/cody-shared'
import { Fzf, type FzfOptions } from 'fzf'
import { workspaceReposMonitor } from '../../../repository/repo-metadata-from-git-api'

type ProviderMention = Mention & { providerUri: string }

function starTiebreaker(a: { item: { stars: number } }, b: { item: { stars: number } }): number {
    return b.item.stars - a.item.stars
}

const REPO_FZF_OPTIONS: FzfOptions<SuggestionsRepo> = {
    selector: item => item.name,
    tiebreakers: [starTiebreaker],
    forward: false,
}

const cleanRegex = (value: string): string => value.replaceAll(/^\^|\\\.|\$$/g, '')

/**
 * Returns ordered list of mentions of remote repositories, order logic is based on
 * fuzzy matching and repository additional metrics.
 *
 * It's a common repository mention fetchers is used in repo, file and directories
 * providers.
 */
export async function getRepositoryMentions(
    query: string,
    providerId: string
): Promise<ProviderMention[]> {
    const { auth } = await currentResolvedConfig()
    const dataOrError = await graphqlClient.searchRepoSuggestions(query)

    if (isError(dataOrError) || dataOrError === null || dataOrError.search === null) {
        return []
    }

    const repositories = dataOrError.search.results.repositories
    const fzf = new Fzf(repositories, REPO_FZF_OPTIONS)
    const localRepos = (await workspaceReposMonitor?.getRepoMetadata()) || []

    return await Promise.all(
        fzf.find(cleanRegex(query)).map(repository =>
            createRepositoryMention(
                {
                    ...repository.item,
                    current: !!localRepos.find(({ repoName }) => repoName === repository.item.name),
                },
                providerId,
                auth
            )
        )
    )
}

type MinimalRepoMention = Pick<SuggestionsRepo, 'id' | 'url' | 'name'> & { current?: boolean }

export async function createRepositoryMention(
    repo: MinimalRepoMention,
    providerId: string,
    { serverEndpoint }: Pick<AuthCredentials, 'serverEndpoint'>
): Promise<ProviderMention> {
    return {
        title: repo.name,
        providerUri: providerId,
        uri: serverEndpoint + repo.url,

        // By default, we show <title> <uri> in the mentions' menu.
        // As repo.url and repo.name are almost same, we do not want to show the uri.
        // So that is why we are setting the description to " " string.
        description: repo.current ? 'Current' : ' ',
        data: {
            repoId: repo.id,
            repoName: repo.name,
            isIgnored: (await contextFiltersProvider.isRepoNameIgnored(repo.name)) satisfies boolean,
        },
    }
}

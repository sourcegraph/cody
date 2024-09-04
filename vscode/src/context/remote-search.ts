import {
    type ContextSearchResult,
    type PromptString,
    type SourcegraphCompletionsClient,
    graphqlClient,
} from '@sourcegraph/cody-shared'

import { isError } from 'lodash'
import { rewriteKeywordQuery } from '../local-context/rewrite-keyword-query'
import type * as repofetcher from './repo-fetcher'

export enum RepoInclusion {
    Automatic = 'auto',
    Manual = 'manual',
}

interface DisplayRepo {
    displayName: string
}

export class RemoteSearch {
    public static readonly MAX_REPO_COUNT = 10

    constructor(private completions: SourcegraphCompletionsClient) {}

    // Repositories we are including automatically because of the workspace.
    private reposAuto: Map<string, DisplayRepo> = new Map()

    // Repositories the user has added manually.
    private reposManual: Map<string, DisplayRepo> = new Map()

    // Removes a manually included repository.
    public removeRepo(repoId: string): void {
        this.reposManual.delete(repoId)
    }

    // Sets the repos to search. RepoInclusion.Automatic is for repositories added
    // automatically based on the workspace; these are presented differently
    // and can't be removed by the user. RepoInclusion.Manual is for repositories
    // added manually by the user.
    public setRepos(repos: repofetcher.Repo[], inclusion: RepoInclusion): void {
        const repoMap: Map<string, DisplayRepo> = new Map(
            repos.map(repo => [repo.id, { displayName: repo.name }])
        )
        switch (inclusion) {
            case RepoInclusion.Automatic: {
                this.reposAuto = repoMap
                break
            }
            case RepoInclusion.Manual: {
                this.reposManual = repoMap
                break
            }
        }
    }

    public getRepos(inclusion: RepoInclusion | 'all'): repofetcher.Repo[] {
        return uniqueRepos(
            [
                ...(inclusion === RepoInclusion.Automatic
                    ? this.reposAuto.entries()
                    : inclusion === RepoInclusion.Manual
                      ? this.reposManual.entries()
                      : [...this.reposAuto.entries(), ...this.reposManual.entries()]),
            ].map(([id, repo]) => ({ id, name: repo.displayName }))
        )
    }

    // Gets the set of all repositories to search.
    public getRepoIdSet(): string[] {
        return Array.from(new Set([...this.reposAuto.keys(), ...this.reposManual.keys()]))
    }

    public async query(
        query: PromptString,
        repoIDs: string[],
        signal?: AbortSignal
    ): Promise<ContextSearchResult[]> {
        if (repoIDs.length === 0) {
            return []
        }
        const rewritten = await rewriteKeywordQuery(this.completions, query, signal)
        const result = await graphqlClient.contextSearch({ repoIDs, query: rewritten, signal })
        if (isError(result)) {
            throw result
        }
        return result || []
    }
}

function uniqueRepos(repos: repofetcher.Repo[]): repofetcher.Repo[] {
    const seen = new Set<string>()
    return repos.filter(repo => {
        if (seen.has(repo.id)) {
            return false
        }
        seen.add(repo.id)
        return true
    })
}

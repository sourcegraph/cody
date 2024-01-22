import * as vscode from 'vscode'

import {
    SourcegraphGraphQLAPIClient,
    type EmbeddingsSearchResults,
    type GraphQLAPIClientConfig,
} from '@sourcegraph/cody-shared'

export class CachedRemoteEmbeddingsClient {
    private client: SourcegraphGraphQLAPIClient
    private repoIdCache: Map<string, string> = new Map()

    constructor(private config: GraphQLAPIClientConfig) {
        this.client = new SourcegraphGraphQLAPIClient(config)
    }

    public getEndpoint(): string {
        return this.config.serverEndpoint
    }

    public updateConfiguration(newConfig: GraphQLAPIClientConfig): void {
        this.config = newConfig
        this.client = new SourcegraphGraphQLAPIClient(newConfig)
        this.repoIdCache.clear()
    }

    public async getRepoIdIfEmbeddingExists(codebase: string): Promise<string | Error | null> {
        const cachedRepoId = this.repoIdCache.get(codebase)
        if (cachedRepoId) {
            return cachedRepoId
        }

        const repoID = await this.client.getRepoIdIfEmbeddingExists(codebase)
        if (!(repoID instanceof Error) && repoID) {
            this.repoIdCache.set(codebase, repoID)
        }
        return repoID
    }

    public async search(
        repoIDs: string[],
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error> {
        if (repoIDs.length !== 1) {
            throw new Error('Only one repoID is supported for now')
        }
        const results = await this.client.legacySearchEmbeddings(
            repoIDs[0],
            query,
            codeResultsCount,
            textResultsCount
        )
        if (results instanceof Error) {
            return results
        }
        results.codeResults.forEach(result => {
            if (!result.uri) {
                result.uri = vscode.Uri.file(result.fileName)
            }
        })
        results.textResults.forEach(result => {
            if (!result.uri) {
                result.uri = vscode.Uri.file(result.fileName)
            }
        })
        return results
    }
}

import * as vscode from 'vscode'

import {
    SourcegraphGraphQLAPIClient,
    type EmbeddingsSearchResult,
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
        workspaceFolderUri: vscode.Uri,
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
        function resolveFileNameToURI({
            fileName,
            ...result
        }: Omit<EmbeddingsSearchResult, 'uri'> & { fileName: string }): EmbeddingsSearchResult {
            return {
                ...result,
                uri: vscode.Uri.joinPath(workspaceFolderUri, fileName),
            }
        }
        return {
            codeResults: results.codeResults.map(resolveFileNameToURI),
            textResults: results.textResults.map(resolveFileNameToURI),
        }
    }
}

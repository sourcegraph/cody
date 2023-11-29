import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql/client'

import { SourcegraphEmbeddingsSearchClient } from './client'

// A factory for SourcegraphEmbeddingsSearchClients. Queries the client
// connection and app (if available) in parallel and returns the one with
// embeddings available.
export const EmbeddingsDetector = {
    // Creates an embeddings search client with the first client in `clients`
    // that has embeddings. If none have embeddings, returns undefined. If all
    // fail, returns the first error.
    async newEmbeddingsSearchClient(
        clients: readonly SourcegraphGraphQLAPIClient[],
        codebase: string,
        codebaseLocalName: string
    ): Promise<SourcegraphEmbeddingsSearchClient | Error | undefined> {
        let firstError: Error | undefined
        let allFailed = true
        for (const promise of clients.map(client => this.detectEmbeddings(client, codebase, codebaseLocalName))) {
            const result = await promise
            const isError = result instanceof Error
            allFailed &&= isError
            if (isError) {
                firstError ||= result
                continue
            }
            if (result === undefined) {
                continue
            }
            // We got a result, drop the rest of the promises on the floor.
            return result()
        }
        if (allFailed) {
            console.log('EmbeddingsDetector', `Error getting embeddings availability for ${codebase}`, firstError)
            return firstError
        }
        return undefined
    },

    // Detects whether *one* client has embeddings for the specified codebase.
    // Returns one of:
    // - A thunk to construct an embeddings search client, if embeddings exist.
    // - undefined, if the client doesn't have embeddings.
    // - An error.
    async detectEmbeddings(
        client: SourcegraphGraphQLAPIClient,
        codebase: string,
        codebaseLocalName: string
    ): Promise<(() => SourcegraphEmbeddingsSearchClient) | Error | undefined> {
        const repoId = await client.getRepoIdIfEmbeddingExists(codebase)
        if (repoId instanceof Error) {
            return repoId
        }
        return repoId
            ? () => new SourcegraphEmbeddingsSearchClient(client, codebase, repoId, codebaseLocalName)
            : undefined
    },
}

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { SourcegraphEmbeddingsSearchClient } from '@sourcegraph/cody-shared/src/embeddings/client'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

const getRepoId = async (client: SourcegraphGraphQLAPIClient, codebase: string) => {
    const repoId = codebase ? await client.getRepoId(codebase) : null
    return repoId
}

export async function createCodebaseContext(
    client: SourcegraphGraphQLAPIClient,
    codebase: string,
    contextType: 'embeddings' | 'keyword' | 'none' | 'blended' | 'unified',
    serverEndpoint: string
): Promise<CodebaseContext> {
    const repoId = await getRepoId(client, codebase)
    if (isError(repoId)) {
        throw repoId
    }

    const embeddingsSearch =
        repoId && !isError(repoId) ? new SourcegraphEmbeddingsSearchClient(client, codebase, repoId) : null

    const codebaseContext = new CodebaseContext(
        { useContext: contextType, experimentalLocalSymbols: false },
        codebase,
        () => serverEndpoint,
        embeddingsSearch,
        null,
        null,
        null
    )

    return codebaseContext
}

import { EmbeddingsSearchResults } from '../sourcegraph-api/graphql/client'

export interface EmbeddingsSearch {
    repoId: string
    endpoint: string
    search(query: string, codeResultsCount: number, textResultsCount: number): Promise<EmbeddingsSearchResults | Error>
}

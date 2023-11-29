import * as status from '../codebase-context/context-status'
import { EmbeddingsSearchResults } from '../sourcegraph-api/graphql/client'

export interface EmbeddingsSearch extends status.ContextStatusProvider {
    repoId: string
    endpoint: string
    search(query: string, codeResultsCount: number, textResultsCount: number): Promise<EmbeddingsSearchResults | Error>
}

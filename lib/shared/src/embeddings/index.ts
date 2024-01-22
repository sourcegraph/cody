import type { URI } from 'vscode-uri'
import type * as status from '../codebase-context/context-status'
import type { EmbeddingsSearchResults } from '../sourcegraph-api/graphql/client'

export interface EmbeddingsSearch extends status.ContextStatusProvider {
    repoId: string
    endpoint: string
    search(
        workspaceFolderUri: URI,
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error>
}

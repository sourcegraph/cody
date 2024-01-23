import type * as status from '../codebase-context/context-status'
import type { EmbeddingsSearchResults, SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { Utils, type URI } from 'vscode-uri'
import type { EmbeddingsSearch } from '.'
import type { EmbeddingsSearchResult } from '../sourcegraph-api/graphql/client'

export class SourcegraphEmbeddingsSearchClient implements EmbeddingsSearch {
    constructor(
        private client: SourcegraphGraphQLAPIClient,
        private repoName: string,
        public readonly repoId: string,
        private codebaseLocalName = '',
        private web = false
    ) {}

    public get endpoint(): string {
        return this.client.endpoint
    }

    public async search(
        workspaceFolderUri: URI,
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error> {
        const result = await (this.web
            ? this.client.searchEmbeddings([this.repoId], query, codeResultsCount, textResultsCount)
            : this.client.legacySearchEmbeddings(this.repoId, query, codeResultsCount, textResultsCount))
        if (result instanceof Error) {
            return result
        }
        const resolveFileNameToURI = ({
            fileName,
            ...result
        }: Omit<EmbeddingsSearchResult, 'uri'> & { fileName: string }): EmbeddingsSearchResult => {
            return {
                ...result,
                uri: Utils.joinPath(workspaceFolderUri, fileName),
            }
        }
        return {
            codeResults: result.codeResults.map(resolveFileNameToURI),
            textResults: result.textResults.map(resolveFileNameToURI),
        }
    }

    public onDidChangeStatus(
        callback: (provider: status.ContextStatusProvider) => void
    ): status.Disposable {
        // This does not change, so there is nothing to report.
        return { dispose: () => {} }
    }

    public get status(): status.ContextGroup[] {
        return [
            {
                displayName: this.codebaseLocalName || this.repoName,
                providers: [
                    {
                        kind: 'embeddings',
                        type: 'remote',
                        state: 'ready',
                        origin: this.endpoint,
                        remoteName: this.repoName,
                    },
                ],
            },
        ]
    }
}

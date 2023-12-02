import * as status from '../codebase-context/context-status'
import { EmbeddingsSearchResults, SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { EmbeddingsSearch } from '.'

export class SourcegraphEmbeddingsSearchClient implements EmbeddingsSearch {
    constructor(
        private client: SourcegraphGraphQLAPIClient,
        private repoName: string,
        public readonly repoId: string,
        private codebaseLocalName: string = '',
        private web: boolean = false
    ) {}

    public get endpoint(): string {
        return this.client.endpoint
    }

    public async search(
        query: string,
        codeResultsCount: number,
        textResultsCount: number
    ): Promise<EmbeddingsSearchResults | Error> {
        if (this.web) {
            return this.client.searchEmbeddings([this.repoId], query, codeResultsCount, textResultsCount)
        }

        return this.client.legacySearchEmbeddings(this.repoId, query, codeResultsCount, textResultsCount)
    }

    public onDidChangeStatus(callback: (provider: status.ContextStatusProvider) => void): status.Disposable {
        // This does not change, so there is nothing to report.
        return { dispose: () => {} }
    }

    public get status(): status.ContextGroup[] {
        return [
            {
                name: this.codebaseLocalName || this.repoName,
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

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
        console.time('SourcegraphEmbeddingsSearchClient.search')
        if (this.web) {
            const res = await this.client.searchEmbeddings([this.repoId], query, codeResultsCount, textResultsCount)
            console.timeEnd('SourcegraphEmbeddingsSearchClient.search')
            return res
        }

        const res = await this.client.legacySearchEmbeddings(this.repoId, query, codeResultsCount, textResultsCount)
        console.timeEnd('SourcegraphEmbeddingsSearchClient.search')
        return res
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

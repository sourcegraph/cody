import { PreciseContext } from '../codebase-context/messages'
import { Editor } from '../editor'
import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql/client'

interface IGraphContextFetcher {
    getContext(): Promise<PreciseContext[]>
}

export class GraphContextFetcher {
    constructor(
        // NOTE: public to keep the graphqlClient threaded, but currently unused
        // due to the backdoor fetcher (and an unmerged Remote API).
        public graphqlClient: SourcegraphGraphQLAPIClient,
        public editor: Editor,

        // NOTE: this is a quick-and-dirty way to inject VSCode API abilities into
        // the graph context fetcher. This means that results from all non-VSCode
        // clients will simply be empty. This is where we'll want to query the
        // context API via GraphQL, if available, and fall back or mix the results
        // from the local fetcher (in a more, better named, way).
        private backdoorFetcher?: IGraphContextFetcher
    ) {}

    public getContext(): Promise<PreciseContext[]> {
        if (!this.backdoorFetcher) {
            return Promise.resolve([])
        }

        return this.backdoorFetcher.getContext()
    }
}

import {
    type ContextSearchResult,
    type PromptString,
    type SourcegraphCompletionsClient,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import { isError } from 'lodash'
import type * as vscode from 'vscode'
import { rewriteKeywordQuery } from '../../local-context/rewrite-keyword-query'
import type { SymfRunner } from '../../local-context/symf'

interface ContextQuery {
    userQuery: PromptString
    repoIDs: string[]
}

export class ContextFetcher implements vscode.Disposable {
    constructor(
        private symf: SymfRunner,
        private llms: SourcegraphCompletionsClient
    ) {}

    public dispose(): void {
        this.symf.dispose()
    }

    public async fetchContext(query: ContextQuery): Promise<ContextSearchResult[]> {
        // TODO(beyang): replace with single server-side call
        const rewritten = await rewriteKeywordQuery(this.llms, query.userQuery)
        const result = await graphqlClient.contextSearch(query.repoIDs, rewritten)
        if (isError(result)) {
            throw result
        }
        return result || []
    }
}

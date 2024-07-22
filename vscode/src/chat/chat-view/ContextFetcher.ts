import {
    type ContextItem,
    ContextItemSource,
    type ContextSearchResult,
    type PromptString,
    type SourcegraphCompletionsClient,
    graphqlClient,
} from '@sourcegraph/cody-shared'
import { isError } from 'lodash'
import * as vscode from 'vscode'
import { rewriteKeywordQuery } from '../../local-context/rewrite-keyword-query'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug } from '../../log'

interface ContextQuery {
    userQuery: PromptString
    repoIDs: string[]
}

export class BaseContextFetcher implements vscode.Disposable {
    constructor(
        private symf: SymfRunner | undefined,
        private llms: SourcegraphCompletionsClient
    ) {}

    public dispose(): void {
        this.symf?.dispose()
    }

    public async fetchContext(query: ContextQuery): Promise<ContextItem[]> {
        // TODO(beyang): replace with single server-side call
        const rewritten = await rewriteKeywordQuery(this.llms, query.userQuery)
        const result = await graphqlClient.contextSearch(query.repoIDs, rewritten)
        if (isError(result)) {
            throw result
        }
        return result?.flatMap(r => contextSearchResultToContextItem(r) ?? []) ?? []
    }
}

// TODO(beyang): merge current PLG and enterprise LLM context into this class,
// further simplifying ChatController
// - toggle the new context on with a feature flag
// - then revisit the server side

function contextSearchResultToContextItem(result: ContextSearchResult): ContextItem | undefined {
    if (result.startLine < 0 || result.endLine < 0) {
        logDebug(
            'ContextFetcher',
            'ignoring server context result with invalid range',
            result.repoName,
            result.uri.toString()
        )
        return undefined
    }
    return {
        type: 'file',
        content: result.content,
        range: new vscode.Range(result.startLine, 0, result.endLine, 0),
        uri: result.uri,
        source: ContextItemSource.Unified,
        repoName: result.repoName,
        title: result.path,
        revision: result.commit,
    }
}

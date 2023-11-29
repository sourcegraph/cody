import { ContextFile } from '../codebase-context/messages'
import { EmbeddingsSearchResult } from '../sourcegraph-api/graphql/client'

export interface ContextResult extends ContextFile {
    repoName?: string
    revision?: string
    fileName: string
    content: string
}

export interface KeywordContextFetcher {
    getContext(query: string, numResults: number): Promise<ContextResult[]>
    getSearchContext(query: string, numResults: number): Promise<ContextResult[]>
}

export interface FilenameContextFetcher {
    getContext(query: string, numResults: number): Promise<ContextResult[]>
}

export interface LocalEmbeddingsFetcher {
    getContext(query: string, numResults: number): Promise<EmbeddingsSearchResult[]>
}

export interface Point {
    row: number
    col: number
}

export interface Range {
    startByte: number
    endByte: number
    startPoint: Point
    endPoint: Point
}

export interface Result {
    fqname: string
    name: string
    type: string
    doc: string
    exported: boolean
    lang: string
    file: string
    range: Range
    summary: string
}

export interface IndexedKeywordContextFetcher {
    getResults(query: string, scopeDirs: string[]): Promise<Promise<Result[]>[]>
}

/**
 * File result that renders in the search panel webview
 */
export interface SearchPanelFile {
    uriString: string
    uriJSON: unknown
    basename: string
    dirname: string
    wsname?: string
    snippets: SearchPanelSnippet[]
}

/**
 * Snippet result that renders in the search panel webview
 */
export interface SearchPanelSnippet {
    contents: string
    range: {
        start: {
            line: number
            character: number
        }
        end: {
            line: number
            character: number
        }
    }
}

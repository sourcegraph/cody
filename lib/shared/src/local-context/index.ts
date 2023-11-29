import { URI } from 'vscode-uri'

import { ContextFileSource } from '../codebase-context/messages'
import { ActiveTextEditorSelectionRange } from '../editor'

export interface ContextResult {
    repoName?: string
    revision?: string

    fileName: string
    content: string

    uri?: URI
    range?: ActiveTextEditorSelectionRange

    // metadata
    source?: ContextFileSource
}

export interface IndexedKeywordContextFetcher {
    getResults(query: string, scopeDirs: string[]): Promise<Promise<Result[]>[]>
    getSearchContext(query: string): Promise<ContextResult[]>
}

export interface KeywordContextFetcher {
    getContext(query: string, numResults: number): Promise<ContextResult[]>
    getSearchContext(query: string, numResults: number): Promise<ContextResult[]>
}

export interface FilenameContextFetcher {
    getContext(query: string, numResults: number): Promise<ContextResult[]>
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
    source?: ContextFileSource
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

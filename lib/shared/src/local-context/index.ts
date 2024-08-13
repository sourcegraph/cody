import type { URI } from 'vscode-uri'
import type { PromptString } from '../prompt/prompt-string'
import type { EmbeddingsSearchResult } from '../sourcegraph-api/graphql/client'

export interface LocalEmbeddingsFetcher {
    getContext(query: PromptString, numResults: number): Promise<EmbeddingsSearchResult[]>
}
interface Point {
    row: number
    col: number
}

interface Range {
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
    file: URI
    range: Range
    summary: string
    blugeScore: number
    heuristicBoostID?: string
}

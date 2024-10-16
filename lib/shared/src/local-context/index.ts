import type { URI } from 'vscode-uri'

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

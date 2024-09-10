export type SearchMatch = ContentMatch

export interface ContentMatch {
    type: 'content'
    path: string
    repository: string
    pathMatches?: Range[]
    repoStars?: number
    repoLastFetched?: string
    branches?: string[]
    commit?: string
    lineMatches?: LineMatch[]
    chunkMatches?: ChunkMatch[]
    language?: string
    debug?: string
}

export interface LineMatch {
    line: string
    lineNumber: number
    offsetAndLengths: number[][]
}

export interface ChunkMatch {
    content: string
    contentStart: Location
    ranges: Range[]

    /**
     * Indicates that content has been truncated.
     *
     * This can only be true when maxLineLength search option is non-zero.
     */
    contentTruncated?: boolean
}

export interface Location {
    offset: number
    line: number
    column: number
}

export interface Range {
    start: Location
    end: Location
}

/**
 * Describes a single group of matches.
 */
export interface MatchGroup {
    // The un-highlighted plain text for the lines in this group.
    plaintextLines: string[]

    // The highlighted HTML corresponding to plaintextLines.
    // The strings each contain a HTML <tr> containing the highlighted code.
    highlightedHTMLRows?: string[]

    // The matches in this group to display.
    matches: MatchGroupMatch[]

    // The 0-based start line of the group (inclusive.)
    startLine: number

    // The 0-based end line of the group (inclusive.)
    endLine: number
}

export interface MatchGroupMatch {
    startLine: number
    startCharacter: number
    endLine: number
    endCharacter: number
}

export enum HighlightResponseFormat {
    /** HTML formatted file content with syntax highlighting. */
    HTML_HIGHLIGHT = 'HTML_HIGHLIGHT',
    /** HTML formatted file content without syntax highlighting. */
    HTML_PLAINTEXT = 'HTML_PLAINTEXT',
    /** SCIP highlighting information as JSON. */
    JSON_SCIP = 'JSON_SCIP',
}

/** A specific highlighted line range to fetch. */
export interface HighlightLineRange {
    /**
     * The last line to fetch (0-indexed, inclusive). Values outside the bounds of the file will
     * automatically be clamped within the valid range.
     */
    endLine: number
    /**
     * The first line to fetch (0-indexed, inclusive). Values outside the bounds of the file will
     * automatically be clamped within the valid range.
     */
    startLine: number
}

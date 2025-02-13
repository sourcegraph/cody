import type {
    AddedLineInfo,
    LineChange,
    ModifiedLineInfo,
    RemovedLineInfo,
    UnchangedLineInfo,
} from '../../decorators/base'

export interface SyntaxHighlightRanges {
    range: [number, number]
    color: string
}

export interface LineHighlights {
    syntaxHighlights: {
        dark: SyntaxHighlightRanges[]
        light: SyntaxHighlightRanges[]
    }
}

export type VisualAddedLineInfo = AddedLineInfo & LineHighlights
export type VisualRemovedLineInfo = RemovedLineInfo & LineHighlights
export type VisualUnchangedLineInfo = UnchangedLineInfo & LineHighlights
export type VisualModifiedLineInfo = ModifiedLineInfo & {
    oldSyntaxHighlights: LineHighlights['syntaxHighlights']
    newSyntaxHighlights: LineHighlights['syntaxHighlights']
}

interface VisualBaseModifiedLine {
    type: 'modified-added' | 'modified-removed'
    changes: LineChange[]
    originalLineNumber: number
    modifiedLineNumber: number
    syntaxHighlights: LineHighlights['syntaxHighlights']
}

export type VisualModifiedLineInfoAdded = VisualBaseModifiedLine & {
    type: 'modified-added'
    text: string
}

export type VisualModifiedLineInfoRemoved = VisualBaseModifiedLine & {
    type: 'modified-removed'
    text: string
}

export type VisualDiffAdditions = VisualAddedLineInfo | VisualRemovedLineInfo | VisualModifiedLineInfo

export type VisualDiffUnified =
    | VisualAddedLineInfo
    | VisualRemovedLineInfo
    | VisualModifiedLineInfoAdded
    | VisualModifiedLineInfoRemoved
    | VisualUnchangedLineInfo

export type VisualDiffLine = VisualDiffAdditions | VisualDiffUnified

/**
 * VisualDiff is an abstraction over DecoratedDiff that is suitable for rendering.
 * It is an ordered list of relevant lines that we can simply iterate over and render.
 *
 * It supports `ModifiedLineInfoAdded` and `ModifiedLineInfoRemoved` to represent the two sides of a modified line.
 * This is useful for rendering a unified diff
 */
export interface VisualDiff {
    type: 'unified' | 'additions'
    lines: VisualDiffLine[]
}

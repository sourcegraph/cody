import type {
    AddedLineInfo,
    LineChange,
    ModifiedLineInfo,
    RemovedLineInfo,
    SyntaxHighlight,
    UnchangedLineInfo,
} from '../../decorators/base'

interface BaseModifiedLineSplit {
    type: 'modified-added' | 'modified-removed'
    changes: LineChange[]
    originalLineNumber: number
    modifiedLineNumber: number
}

export interface ModifiedLineInfoAdded extends BaseModifiedLineSplit {
    type: 'modified-added'
    text: string
    highlights: SyntaxHighlight
}
export interface ModifiedLineInfoRemoved extends BaseModifiedLineSplit {
    type: 'modified-removed'
    text: string
    highlights: SyntaxHighlight
}

export type VisualDiffAdditions = AddedLineInfo | RemovedLineInfo | ModifiedLineInfo

export type VisualDiffUnified =
    | AddedLineInfo
    | RemovedLineInfo
    | ModifiedLineInfoAdded
    | ModifiedLineInfoRemoved
    | UnchangedLineInfo

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

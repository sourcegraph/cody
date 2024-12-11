import type * as vscode from 'vscode'

/**
 * Represents a decorator that manages VS Code editor decorations for auto-edit suggestions.
 *
 * This interface defines the contract for displaying and managing decorative elements
 * that visualize proposed text changes in the editor.
 *
 * Lifecycle:
 * - A single instance should be created per decoration session and disposed of when the decorations
 *   are no longer needed.
 * - Always call dispose() when the decorator is no longer needed to clean up resources.
 * - Dispose should always clear the decorations.
 *
 * Usage Pattern:
 * ```typescript
 * const decorator = createAutoEditsDecorator(...);
 * try {
 *   decorator.setDecorations(decorationInfo);
 *   ...
 * } finally {
 *   decorator.dispose();
 * }
 * ```
 */
export interface AutoEditsDecorator extends vscode.Disposable {
    /**
     * Applies decorations to the editor based on the provided decoration information.
     *
     * @param decorationInfo Contains the line-by-line information about text changes
     *        and how they should be decorated in the editor.
     */
    setDecorations(decorationInfo: DecorationInfo): void
}

/**
 * Represents a line of text with its change type and content.
 */
export type DecorationLineInfo = AddedLineInfo | RemovedLineInfo | ModifiedLineInfo | UnchangedLineInfo

export interface AddedLineInfo {
    id: string
    type: 'added'
    text: string
    modifiedLineNumber: number
    /** signifies if this part of the prediction is rendered by the inline completion item provider */
    usedAsInlineCompletion?: boolean
}

export interface RemovedLineInfo {
    id: string
    type: 'removed'
    text: string
    originalLineNumber: number
}

export interface ModifiedLineInfo {
    id: string
    type: 'modified'
    oldText: string
    newText: string
    changes: LineChange[]
    originalLineNumber: number
    modifiedLineNumber: number
}

export interface UnchangedLineInfo {
    id: string
    type: 'unchanged'
    text: string
    originalLineNumber: number
    modifiedLineNumber: number
}

export type LineChange = {
    id: string
    type: 'insert' | 'delete' | 'unchanged'
    /** `range` in the modified text relative to the document start */
    range: vscode.Range
    text: string
    /** signifies if this part of the prediction is rendered by the inline completion item provider */
    usedAsInlineCompletion?: boolean
}

export interface DecorationInfo {
    modifiedLines: ModifiedLineInfo[]
    removedLines: RemovedLineInfo[]
    addedLines: AddedLineInfo[]
    unchangedLines: UnchangedLineInfo[]
}

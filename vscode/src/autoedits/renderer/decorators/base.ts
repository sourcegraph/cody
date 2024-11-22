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
    type: 'added'
    text: string
    /** `lineNumber` in the modified text */
    lineNumber: number
}

export interface RemovedLineInfo {
    type: 'removed'
    text: string
    /** `lineNumber` in the original text */
    lineNumber: number
}

export interface ModifiedLineInfo {
    type: 'modified'
    oldText: string
    newText: string
    changes: LineChange[]
    /** `lineNumber` in the modified text */
    lineNumber: number
}

export interface UnchangedLineInfo {
    type: 'unchanged'
    text: string
    /** `lineNumber` in the modified text */
    lineNumber: number
}

export type LineChange = {
    type: 'insert' | 'delete'
    /** `range` in the modified text relative to the document start */
    range: vscode.Range
    text: string
}

export interface DecorationInfo {
    modifiedLines: ModifiedLineInfo[]
    removedLines: RemovedLineInfo[]
    addedLines: AddedLineInfo[]
    unchangedLines: UnchangedLineInfo[]
}

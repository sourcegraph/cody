import type * as vscode from 'vscode'

/**
 * Represents a decoration with associated text content.
 * We support an additional field `text` to allow the decoration content to be hoisted up
 * and made generic for clients that do not support decorations.
 */
export interface AutoEditDecoration extends vscode.DecorationOptions {
    /**
     * The content of the text to be inserted, without any special formatting that is
     * specific to VS Code decorations. This is used to produce a generic representation
     * of the decoration content for non-VS Code clients.
     */
    text: string
}

export interface AutoEditDecorations {
    /**
     * Decorations to represent text to be inserted
     */
    insertionDecorations: AutoEditDecoration[]
    /**
     * Decorations to represent text to be deleted
     */
    deletionDecorations: AutoEditDecoration[]
    /**
     * Decorations to represent the start point for the overall change.
     */
    insertMarkerDecorations: AutoEditDecoration[]
}

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
    setDecorations(
        /**
         * @deprecated Decorations are pre-computed by the manager in `getRenderOutput`.
         * Use `decorations` instead.
         */
        decorationInfo: DecorationInfo,
        decorations?: AutoEditDecorations
    ): void
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
    /** `range` in the original text relative to the document start */
    originalRange: vscode.Range
    /** `range` in the modified text relative to the document start */
    modifiedRange: vscode.Range
    text: string
}

export interface DecorationInfo {
    modifiedLines: ModifiedLineInfo[]
    removedLines: RemovedLineInfo[]
    addedLines: AddedLineInfo[]
    unchangedLines: UnchangedLineInfo[]
}

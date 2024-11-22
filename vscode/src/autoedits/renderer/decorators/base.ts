import type * as vscode from 'vscode'
import type { ModifiedRange } from '../diff-utils'

/**
 * Represents a decorator that manages VS Code editor decorations for auto-edit suggestions.
 *
 * This interface defines the contract for displaying and managing decorative elements
 * that visualize proposed text changes in the editor.
 *
 * Lifecycle:
 * - Single instance should be created per decoration session and disposed of when the decorations
 *   are no longer needed.
 * - Always call dispose() when the decorator is no longer needed to clean up resources.
 * - Dispose should always clear the decorations.
 *
 * Usage Pattern:
 * ```typescript
 * const decorator = createAutoeditsDecorator(...);
 * try {
 *   decorator.setDecorations(decorationInfo);
 *   ...
 * } finally {
 *   decorator.clearDecorations();
 *   decorator.dispose();
 * }
 * ```
 */
export interface AutoeditsDecorator extends vscode.Disposable {
    /**
     * Applies decorations to the editor based on the provided decoration information.
     *
     * @param decorationInformation Contains the line-by-line information about text changes
     *        and how they should be decorated in the editor.
     */
    setDecorations(decorationInformation: DecorationInformation): void
}

/**
 * Represents the different types of line decorations that can be applied.
 */
export enum DecorationLineType {
    /** Line has been modified from its original state */
    Modified = 0,
    /** New line has been added */
    Added = 1,
    /** Line has been removed */
    Removed = 2,
    /** Line remains unchanged */
    Unchanged = 3,
}

export interface DecorationLineInformation {
    lineType: DecorationLineType
    // Line number in the original text. The line number can be null if the line was added.
    oldLineNumber: number | null
    // Line number in the new predicted text. The line number can be null if the line was removed.
    newLineNumber: number | null
    // The text of the line in the original text.
    oldText: string
    // The text of the line in the new predicted text.
    newText: string
    // The ranges of text that were modified in the line.
    modifiedRanges: ModifiedRange[]
}

export interface DecorationInformation {
    lines: DecorationLineInformation[]
    oldLines: string[]
    newLines: string[]
}

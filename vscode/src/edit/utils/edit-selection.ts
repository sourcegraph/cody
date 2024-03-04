import * as vscode from 'vscode'

import { getSmartSelection } from '../../editor/utils'
import type { EditIntent } from '../types'
import { getEditIntent } from './edit-intent'

interface SmartSelectionOptions {
    forceExpand?: boolean
}

/**
 * This function retrieves a "smart" selection for a FixupTask when selectionRange is not available.
 *
 * The idea of a "smart" selection is to look at both the start and end positions of the current selection,
 * and attempt to expand those positions to encompass more meaningful chunks of code, such as folding regions.
 *
 * The function does the following:
 * 1. Finds the document URI from it's fileName
 * 2. If the selection starts in a folding range, moves the selection start position back to the start of that folding range.
 * 3. If the selection ends in a folding range, moves the selection end positionforward to the end of that folding range.
 * @returns A Promise that resolves to an `vscode.Range` which represents the combined "smart" selection.
 */
export async function getEditSmartSelection(
    document: vscode.TextDocument,
    selectionRange: vscode.Range,
    { forceExpand }: SmartSelectionOptions = {},
    intent?: EditIntent
): Promise<vscode.Range> {
    // Use selectionRange when it's available
    if (!forceExpand && selectionRange && !selectionRange?.start.isEqual(selectionRange.end)) {
        return selectionRange
    }

    // Return original (empty) range if we will resolve to generate new code
    if (!forceExpand && getEditIntent(document, selectionRange, intent) === 'add') {
        return selectionRange
    }

    // Retrieve the start position of the current selection
    const activeCursorStartPosition = selectionRange.start
    // If we find a new expanded selection position then we set it as the new start position
    // and if we don't then we fallback to the original selection made by the user
    const newSelectionStartingPosition =
        (await getSmartSelection(document, activeCursorStartPosition.line))?.start ||
        selectionRange.start

    // Retrieve the ending line of the current selection
    const activeCursorEndPosition = selectionRange.end
    // If we find a new expanded selection position then we set it as the new ending position
    // and if we don't then we fallback to the original selection made by the user
    const newSelectionEndingPosition =
        (await getSmartSelection(document, activeCursorEndPosition.line))?.end || selectionRange.end

    // Create a new range that starts from the beginning of the folding range at the start position
    // and ends at the end of the folding range at the end position.
    return new vscode.Range(
        newSelectionStartingPosition.line,
        newSelectionStartingPosition.character,
        newSelectionEndingPosition.line,
        newSelectionEndingPosition.character
    )
}

/**
 * Expands the selection to include all non-whitespace characters from the selected lines.
 * This is to help produce consistent edits regardless of user behaviour.
 */
export function getEditLineSelection(
    document: vscode.TextDocument,
    selection: vscode.Range
): vscode.Range {
    if (selection.isEmpty) {
        // No selection to expand, do nothing
        return selection
    }

    const startChar = document.lineAt(selection.start.line).firstNonWhitespaceCharacterIndex
    const endChar = document.lineAt(selection.end.line).text.length
    return new vscode.Range(selection.start.line, startChar, selection.end.line, endChar)
}

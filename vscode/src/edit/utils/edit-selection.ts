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
        (await getSmartSelection(document, activeCursorStartPosition))?.start || selectionRange.start

    // Retrieve the ending line of the current selection
    const activeCursorEndPosition = selectionRange.end
    // If we find a new expanded selection position then we set it as the new ending position
    // and if we don't then we fallback to the original selection made by the user
    const newSelectionEndingPosition =
        (await getSmartSelection(document, activeCursorEndPosition))?.end || selectionRange.end

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
    selection: vscode.Range,
    { forceExpand }: SmartSelectionOptions = {}
): vscode.Range {
    if (selection.isEmpty && !forceExpand) {
        // No selection to expand, do nothing
        return selection
    }

    const startChar = document.lineAt(selection.start.line).firstNonWhitespaceCharacterIndex
    const endChar = document.lineAt(selection.end.line).text.length
    return new vscode.Range(selection.start.line, startChar, selection.end.line, endChar)
}

/**
 * Given a provided user selection, adjust this to match an more optimal, realistic selection.
 * This helps reduce the chance of user errors where an Edit may be triggered with either:
 * - Too little text selected (e.g. the user selected all but a few chars of a function)
 * - Too much text selected (e.g. a user selected a function, and some extra lines of whitespace)
 *
 * We expand, and then trim the selection to match only the intended non-whitespace characters
 */
export function getEditAdjustedUserSelection(
    document: vscode.TextDocument,
    selection: vscode.Selection
): vscode.Range {
    if (selection.isEmpty) {
        // No selection provided, do nothing
        return selection
    }

    // Expand the selection to include all non-whitespace characters from the selected lines
    const lineSelection = getEditLineSelection(document, selection)
    const text = document.getText(lineSelection)

    // Trim any additional whitespace characters (e.g. additional lines) from the selection
    const trimmedText = text.trim()
    const startOffset = document.offsetAt(lineSelection.start) + text.indexOf(trimmedText)
    const endOffset = startOffset + trimmedText.length

    return new vscode.Selection(document.positionAt(startOffset), document.positionAt(endOffset))
}

/**
 * Returns a range that represents the default provided range for an edit operation.
 *
 * If the user has made an active selection, the function will return the line-expanded
 * selection range. Otherwise, it will return `undefined`, indicating that no default
 * range is available.
 */
export function getEditDefaultProvidedRange(
    document: vscode.TextDocument,
    selection: vscode.Selection
): vscode.Range | undefined {
    if (!selection.isEmpty) {
        // User has made an active selection.
        // We have to use their selection as the intended range.
        return getEditLineSelection(document, selection)
    }

    // No usable selection, fallback to the range expansion behaviour for Edit
    return
}

import * as vscode from 'vscode'

/**
 * Calculates the minimum distance from the given position to the start or end of the provided range.
 */
export function getMinimumDistanceToRangeBoundary(
    position: vscode.Position,
    range: vscode.Range
): number {
    const startDistance = Math.abs(position.line - range.start.line)
    const endDistance = Math.abs(position.line - range.end.line)
    return Math.min(startDistance, endDistance)
}

/**
 * Given some `insertedText`, adjusts the provided `range` to account for the
 * additional lines and characters that were inserted.
 */
export function expandRangeToInsertedText(range: vscode.Range, insertedText: string): vscode.Range {
    const insertedLines = insertedText.split(/\r\n|\r|\n/m)
    const lastLineLength = insertedLines.at(-1)?.length || 0
    return new vscode.Range(
        range.start,
        insertedLines.length === 1
            ? range.start.translate(0, lastLineLength)
            : new vscode.Position(range.start.line + insertedLines.length - 1, lastLineLength)
    )
}

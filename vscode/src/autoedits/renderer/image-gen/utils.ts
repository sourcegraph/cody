import { getEditorInsertSpaces, getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { VisualDiff } from './decorated-diff/types'
import { getLines } from './decorated-diff/utils'

const UNICODE_SPACE = '\u00A0'

export function getEndColumnForLine(line: vscode.TextLine, document: vscode.TextDocument): number {
    const insertSpaces = getEditorInsertSpaces(document.uri, vscode.workspace, vscode.window)
    if (insertSpaces) {
        // We can reliably use the range position for files using space characters
        return line.range.end.character
    }

    // For files using tab-based indentation, we need special handling.
    // VSCode's Range API doesn't account for tab display width
    // We need to:
    // 1. Convert tabs to spaces based on editor tab size
    // 2. Calculate the visual width including both indentation and content
    const tabSize = getEditorTabSize(document.uri, vscode.workspace, vscode.window)
    const tabAsSpace = UNICODE_SPACE.repeat(tabSize)
    const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex
    const indentationText = line.text.substring(0, firstNonWhitespaceCharacterIndex)
    const spaceAdjustedEndCharacter =
        indentationText.replaceAll(/\t/g, tabAsSpace).length +
        (line.text.length - firstNonWhitespaceCharacterIndex)

    return spaceAdjustedEndCharacter
}

/**
 * Given a diff, determine the optimum position to render the image in the document.
 * Line: Should match the first relevant line of the diff.
 * Offset: Should be the end column of the longest line in the diff. Ensures no existing code is overlapped.
 */
export function getDiffTargetPosition(
    diff: VisualDiff,
    document: vscode.TextDocument
): { line: number; offset: number } {
    const incomingLines = getLines(diff, 'incoming')
    const editorLines = incomingLines
        .filter(line => line.modifiedLineNumber <= document.lineCount)
        .map(line => document.lineAt(line.modifiedLineNumber))

    // We will render the image alongside the first line of the diff
    const startLine = Math.min(...editorLines.map(line => line.lineNumber))

    // The image should not overlap with any code in the file, so we take the longest associated line length
    const targetRenderColumn = Math.max(...editorLines.map(line => getEndColumnForLine(line, document)))

    return { line: startLine, offset: targetRenderColumn }
}

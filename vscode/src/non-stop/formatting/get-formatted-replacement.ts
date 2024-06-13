import type * as vscode from 'vscode'
import type { Edit } from '../line-diff'

export async function getFormattedReplacement(
    document: vscode.TextDocument,
    currentText: string,
    range: vscode.Range,
    changes: Edit[]
): Promise<string | undefined> {
    let formattedReplacement = currentText
    let offsetAdjustment = 0
    const taskOffset = document.offsetAt(range.start)

    for (const change of changes) {
        // Convert the range start and end positions to offsets relative to the selection range
        const startOffset = document.offsetAt(change.range.start) - taskOffset + offsetAdjustment
        const endOffset = document.offsetAt(change.range.end) - taskOffset + offsetAdjustment

        // Replace the text within the range with the new text
        formattedReplacement =
            formattedReplacement.substring(0, startOffset) +
            change.text +
            formattedReplacement.substring(endOffset)

        // Adjust the offset for subsequent changes
        offsetAdjustment += change.text.length - (endOffset - startOffset)
    }

    return formattedReplacement
}

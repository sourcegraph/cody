import type * as vscode from 'vscode'

function doRangesOverlap(a: vscode.Range, b: vscode.Range): boolean {
    return a.end.isAfter(b.start) && b.end.isAfter(a.start)
}

export function getCompletionContextAwareDocument(
    document: vscode.TextDocument,
    inlineCompletionContext: vscode.InlineCompletionContext
): vscode.TextDocument {
    const { selectedCompletionInfo } = inlineCompletionContext
    if (!selectedCompletionInfo) {
        // No need to make the document context aware, return as normal
        return document
    }

    return {
        ...document,
        getText(range) {
            const documentText = document.getText(range)
            if (range && !doRangesOverlap(range, selectedCompletionInfo.range)) {
                // The target range does not intersect with the affected range. Return as normal
                return documentText
            }

            let startOffset = document.offsetAt(selectedCompletionInfo.range.start)
            let endOffset = document.offsetAt(selectedCompletionInfo.range.end)

            if (range) {
                const startOffsetForRange = document.offsetAt(range.start)
                startOffset = Math.max(0, startOffset - startOffsetForRange)
                endOffset = Math.min(documentText.length, endOffset - startOffsetForRange)
            }

            return (
                documentText.substring(0, startOffset) +
                selectedCompletionInfo.text +
                documentText.substring(endOffset)
            )
        },
        offsetAt(position) {
            const selectedCompletionStart = selectedCompletionInfo.range.start
            const selectedCompletionEnd = selectedCompletionInfo.range.end

            // We only need to shift ranges when the selectedCompletion range overlaps or is
            // before the target position
            if (position.isBefore(selectedCompletionStart)) {
                return document.offsetAt(position)
            }

            // If the position if after the end of the selectedCompletion, we just need to
            // shift the position by the change characters added/removed by the selectedCompletion
            if (position.isAfterOrEqual(selectedCompletionEnd)) {
                const originalLength =
                    document.offsetAt(selectedCompletionEnd) - document.offsetAt(selectedCompletionStart)
                const selectedCompletionLength = selectedCompletionInfo.text.length
                const lengthDifference = selectedCompletionLength - originalLength
                return document.offsetAt(position) + lengthDifference
            }

            // If the position is within the completion, we need to calculate the
            // exact characters needed to add/remove based on how far into the selectedCompletion
            // the position is
            const positionOffsetIntoOriginal =
                document.offsetAt(position) - document.offsetAt(selectedCompletionStart)
            return (
                document.offsetAt(selectedCompletionStart) +
                Math.min(positionOffsetIntoOriginal, selectedCompletionInfo.text.length)
            )
        },
    }
}

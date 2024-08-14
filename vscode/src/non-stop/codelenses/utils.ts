import * as vscode from 'vscode'
import type { Edit } from '../line-diff'

/**
 * Given a diff, chunks the insertions and deletions into a new set of edits.
 * A new chunk is created if a deletion is immediately followed by an insertion.
 * This order is dervied from the logic in `computeDiff` and the `diff` NPM package.
 * TODO: Consider chunking the diffs in `computeDiff` instead of using this util.
 */
export function getChunkedEditRanges(diff?: Edit[]): vscode.Range[] {
    if (!diff) {
        return []
    }

    const chunkedChanges: vscode.Range[] = []
    for (let i = 0; i < diff.length; i++) {
        const change = diff[i]
        if (i === 0) {
            // Nothing to combine
            chunkedChanges.push(change.range)
            continue
        }

        const lastChange = diff[i - 1]
        if (lastChange.type !== 'decoratedReplacement' && change.type !== 'insertion') {
            // We only chunk when we have an deletion immediately followed by an insertion
            // Do nothing if we do not meet this criteria
            chunkedChanges.push(change.range)
            continue
        }

        if (change.range.start.line !== lastChange.range.end.line) {
            // Although we have a deletion immediately followed by an insertion, the lines are not contiguous
            // We cannot chunk these changes
            chunkedChanges.push(change.range)
            continue
        }

        // A continguous deletion and insertion, combine the changes into a single chunk
        chunkedChanges.pop()
        const combinedRange = new vscode.Range(lastChange.range.start, change.range.end)
        chunkedChanges.push(combinedRange)
    }

    return chunkedChanges
}

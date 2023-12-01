import * as vscode from 'vscode'

// See vscode.TextDocumentContentChangeEvent
export interface TextChange {
    range: vscode.Range
    text: string
}

export interface UpdateRangeOptions {
    /**
     * Whether to expand a range when a change is affixed to the original range.
     * This changes the behaviour to support cases where we want to include appending or prepending to an original range.
     * For example, allowing Cody to insert a docstring immediately before a function.
     */
    supportRangeAffix?: boolean
}

/**
 * Given a range and *multiple* edits, update the range for the edit. This
 * works by adjusting the range of each successive edit so that the edits
 * "stack."
 *
 * vscode's edit operations don't allow overlapping ranges. So we can just
 * adjust apply the edits in reverse order and end up with the right
 * adjustment for a compound edit.
 *
 * Note, destructively mutates the `changes` array.
 */
export function updateRangeMultipleChanges(
    range: vscode.Range,
    changes: TextChange[],
    options: UpdateRangeOptions = {},
    rangeUpdater = updateRange
): vscode.Range {
    changes.sort((a, b) => (b.range.start.isBefore(a.range.start) ? -1 : 1))
    for (let i = 0; i < changes.length - 1; i++) {
        console.assert(
            changes[i].range.start.isAfterOrEqual(changes[i + 1].range.end),
            'vscode edit model assumption incorrect'
        )
    }
    for (const change of changes) {
        range = rangeUpdater(range, change, options)
    }
    return range
}

// Given a range and an edit, updates the range for the edit. Edits at the
// start or end of the range shrink the range. If the range is deleted, return a
// zero-width range at the start of the edit.
export function updateRange(range: vscode.Range, change: TextChange, options: UpdateRangeOptions = {}): vscode.Range {
    const lines = change.text.split(/\r\n|\r|\n/m)
    const insertedLastLine = lines.at(-1)?.length
    if (insertedLastLine === undefined) {
        throw new TypeError('unreachable') // Any string .split produces a non-empty array.
    }
    const insertedLineBreaks = lines.length - 1

    // Handle edits
    // support combining non-whitespace appended changes with the original range
    if (options.supportRangeAffix && change.range.start.isEqual(range.end) && change.text.trim().length > 0) {
        return new vscode.Range(
            range.start,
            change.range.end.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.end.line
                    ? change.range.start.character - change.range.end.character + insertedLastLine
                    : 0
            )
        )
    }
    // support combining non-whitespace prepended changes with the original range
    if (options.supportRangeAffix && change.range.end.isEqual(range.start) && change.text.trim().length > 0) {
        return new vscode.Range(
            change.range.start,
            range.end.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.end.line
                    ? insertedLastLine -
                          change.range.end.character +
                          (insertedLineBreaks === 0 ? change.range.start.character : 0)
                    : 0
            )
        )
    }

    // ...after
    if (change.range.start.isAfterOrEqual(range.end)) {
        return range
    }
    // ...before
    if (change.range.end.isBeforeOrEqual(range.start)) {
        range = range.with(
            range.start.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.start.line
                    ? insertedLastLine +
                          -change.range.end.character +
                          (insertedLineBreaks === 0 ? change.range.start.character : 0)
                    : 0
            ),
            range.end.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.end.line
                    ? insertedLastLine -
                          change.range.end.character +
                          (insertedLineBreaks === 0 ? change.range.start.character : 0)
                    : 0
            )
        )
    }
    // ...around
    else if (change.range.start.isBeforeOrEqual(range.start) && change.range.end.isAfterOrEqual(range.end)) {
        return new vscode.Range(change.range.start, change.range.start)
    }
    // ...within
    else if (change.range.start.isAfterOrEqual(range.start) && change.range.end.isBeforeOrEqual(range.end)) {
        range = range.with(
            range.start,
            range.end.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.end.line
                    ? change.range.start.character - change.range.end.character + insertedLastLine
                    : 0
            )
        )
    }
    // ...overlapping start
    else if (change.range.end.isBefore(range.end)) {
        range = range.with(
            // Move the start of the decoration to the end of the change
            change.range.end.translate(
                change.range.start.line - change.range.end.line,
                change.range.start.character - change.range.end.character + insertedLastLine
            ),
            // Adjust the end of the decoration for the range deletion
            range.end.translate(
                change.range.start.line - change.range.end.line,
                change.range.end.line === range.end.line
                    ? change.range.start.character - change.range.end.character + insertedLastLine
                    : 0
            )
        )
    }
    // ...overlapping end
    else {
        range = range.with(
            range.start,
            // Move the end of the decoration to the start of the change
            change.range.start
        )
    }
    return range
}

/**
 * Given a range and an edit, shifts the range for the edit.
 * Only handles edits that are outside of the range, as it is purely focused on shifting a fixed range in a document.
 * Does not expand or shrink the original rank.
 */
export function updateFixedRange(range: vscode.Range, change: TextChange): vscode.Range {
    const lines = change.text.split(/\r\n|\r|\n/m)
    const insertedLastLine = lines.at(-1)?.length
    if (insertedLastLine === undefined) {
        throw new TypeError('unreachable') // Any string .split produces a non-empty array.
    }
    const insertedLineBreaks = lines.length - 1

    // The only case where a range should be shifted is when the change happens before the range.
    // In this case, we just need to adjust the start and end position depending on if the incoming change added or removed text.
    if (change.range.end.isBefore(range.start)) {
        range = range.with(
            range.start.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.start.line
                    ? insertedLastLine +
                          -change.range.end.character +
                          (insertedLineBreaks === 0 ? change.range.start.character : 0)
                    : 0
            ),
            range.end.translate(
                change.range.start.line - change.range.end.line + insertedLineBreaks,
                change.range.end.line === range.end.line
                    ? insertedLastLine -
                          change.range.end.character +
                          (insertedLineBreaks === 0 ? change.range.start.character : 0)
                    : 0
            )
        )
    }

    return range
}

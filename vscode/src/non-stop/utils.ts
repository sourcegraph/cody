import * as vscode from 'vscode'

export enum CodyTaskState {
    /**
     * The task has been created, but not yet started.
     */
    Idle = 'Idle',
    /**
     * The task has been started, but we have not yet received an actionable
     * response from the LLM.
     */
    Working = 'Working',
    /**
     * We have received a response from the LLM, and we intend to apply the
     * response to the document as we receive it.
     * Similar to `applying` but we do not wait for the LLM to finish responding.
     */
    Inserting = 'Inserting',
    /**
     * We have received a complete response from the LLM, and we are in the process
     * of applying the full response to the document.
     */
    Applying = 'Applying',
    /**
     * The response has been applied to the document, and we are satisfied enough to present it to the user.
     * The user hasn't technically accepted it, and they can still act on the response.
     * E.g. Undo the change, Retry the change, View the diff.
     */
    Applied = 'Applied',
    /**
     * Terminal state. The response has been "accepted" by the user. This is either by:
     * - Clicking "Accept" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    Finished = 'Finished',
    /**
     * Terminal state. We received an error somewhere in the process.
     * We present this error to the user, the response can be "discarded" by the user by:
     * - Clicking "Discard" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    Error = 'Error',
    /**
     * Additional state currently only used for the `test` command.
     * This state is used to signify that an Edit is no longer idle, but waiting for
     * some additional information before it is started (e.g. a file name from the LLM)
     */
    Pending = 'Pending',
}

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
/**
 * Given some `insertedText`, adjusts the provided `range` to account for the
 * additional lines and characters that were inserted.
 * @param range The original range before the text was inserted
 * @param insertedText The text that was inserted into the document
 * @returns A new range that encompasses the original range plus the inserted text
 */
export function expandRangeToInsertedText(range: vscode.Range, insertedText: string): vscode.Range {
    // Split the inserted text into lines
    const insertedLines = insertedText.split(/\r\n|\r|\n/m)
    // Get the length of the last line of the inserted text
    const lastLineLength = insertedLines.at(-1)?.length || 0
    // Return a new range
    return new vscode.Range(
        range.start,
        // If the inserted text is only one line, just translate the end position by the length of the line
        insertedLines.length === 1
            ? range.start.translate(0, lastLineLength)
            : // Otherwise, create a new end position at the last line of the inserted text
              new vscode.Position(range.start.line + insertedLines.length - 1, lastLineLength)
    )
}

// edit 1 triggers
// edit 2 triggers, edit 1 stays active
// edit 1 completes, we show diff, codelens etc
// edit 2 completes, we automatically accept edit 1, show diff, codelens for edit 2

import type * as vscode from 'vscode'

export enum CodyTaskState {
    /**
     * The task has been created, but not yet started.
     */
    idle = 1,
    /**
     * The task has been started, but we have not yet received an actionable
     * response from the LLM.
     */
    working = 2,
    /**
     * We have received an response from the LLM, and we intent to apply the
     * response to the document as we receive it.
     * Similar to `applying` but we do not wait for the LLM to finish responding.
     */
    inserting = 3,
    /**
     * We have received a complete response from the LLM, and we are in the process
     * of appplying the full response to the document.
     */
    applying = 4,
    /**
     * The response has been applied to the document, and we are attempting to format
     * it using the users' preferred formatter.
     */
    formatting = 5,
    /**
     * The response has been applied to the document and we are satisifed enough to present it to the user.
     * The user hasn't technically accepted it, and they can still act on the response.
     * E.g. Undo the change, Retry the change, View the diff.
     */
    applied = 6,
    /**
     * Terminal state. The response has been "accepted" by the user. This is either by:
     * - Clicking "Accept" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    finished = 7,
    /**
     * Terminal state. We received an error somewhere in the process.
     * We present this error to the user, the response can be "discarded" by the user by:
     * - Clicking "Discard" via the CodeLens
     * - Saving the document
     * - Making an edit within the range of the response (implied acceptance)
     */
    error = 8,
}

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

import type * as vscode from 'vscode'

export enum CodyTaskState {
    idle = 1,
    working = 2,
    inserting = 3,
    applying = 4,
    formatting = 5,
    applied = 6,
    finished = 7,
    error = 8,
    pending = 9,
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

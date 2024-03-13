import type * as vscode from 'vscode'

/*
export enum CodyTaskState {
    idle = 'idle',
    working = 'working',
    inserting = 'inserting',
    applying = 'applying',
    formatting = 'formatting',
    applied = 'applied',
    finished = 'finished',
    error = 'error',
    pending = 'pending',
}
*/

export enum CodyTaskState {
    idle = 0,
    working = 1,
    inserting = 2,
    applying = 3,
    formatting = 4,
    applied = 5,
    finished = 6,
    error = 7,
    pending = 8,
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

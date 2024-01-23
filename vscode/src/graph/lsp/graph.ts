import type * as vscode from 'vscode'

/**
 * Returns a key unique to a given location for use with `dedupeWith`.
 */
export const locationKeyFn = (location: vscode.Location): string =>
    `${location.uri?.fsPath}?L${location.range.start.line}:${location.range.start.character}`

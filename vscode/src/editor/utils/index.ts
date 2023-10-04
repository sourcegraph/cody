import * as vscode from 'vscode'

import { getSelectionAroundLine } from './document-sections'

/**
 * Gets the folding range containing the target position to use as a smart selection.
 *
 * This should only be used when there is no existing selection, as a fallback.
 *
 * The smart selection removes the need to manually highlight code before running a command.
 * Instead, this tries to identify the folding range containing the user's cursor to use as the
 * selection range. For example, a docstring can be added to the target folding range when running
 * the /doc command.
 *
 * NOTE: Smart selection should be treated as a fallback, since it guesses the user's intent. A
 * manual selection truly reflects the user's intent and should be preferred when possible. Smart
 * selection can be unreliable in some cases. Callers needing the true selection range should always
 * use the manual selection method to ensure accuracy.
 *
 * @param uri - The document URI.
 * @param target - The target position in the document.
 *
 * @returns The folding range containing the target position, if one exists. Otherwise returns
 * undefined.
 */
export async function getSmartSelection(uri: vscode.Uri, target: number): Promise<vscode.Selection | undefined> {
    return getSelectionAroundLine(await vscode.workspace.openTextDocument(uri), target)
}

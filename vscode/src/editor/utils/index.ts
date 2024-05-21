import * as vscode from 'vscode'

import { execQueryWrapper } from '../../tree-sitter/query-sdk'
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
 * @param documentOrUri - The document or the document URI.
 * @param target - The target position in the document.
 * @returns The folding range containing the target position, if one exists. Otherwise returns
 * undefined.
 */
export async function getSmartSelection(
    documentOrUri: vscode.TextDocument | vscode.Uri,
    target: vscode.Position
): Promise<vscode.Selection | undefined> {
    const document =
        documentOrUri instanceof vscode.Uri
            ? await vscode.workspace.openTextDocument(documentOrUri)
            : documentOrUri

    const [enclosingFunction] = execQueryWrapper({
        document,
        position: target,
        queryWrapper: 'getEnclosingFunction',
    })

    if (enclosingFunction) {
        const { startPosition, endPosition } = enclosingFunction.node
        // Regardless of the columns provided, we want to ensure the edit spans the full range of characters
        // on the start and end lines. This helps improve the reliability of the output.
        const adjustedStartColumn = document.lineAt(startPosition.row).firstNonWhitespaceCharacterIndex
        const adjustedEndColumn = Number.MAX_SAFE_INTEGER
        return new vscode.Selection(
            startPosition.row,
            adjustedStartColumn,
            endPosition.row,
            adjustedEndColumn
        )
    }

    return getSelectionAroundLine(document, target.line)
}

/**
 * Returns an array of URI's for all unique open editor tabs.
 *
 * Loops through all open tab groups and tabs, collecting the URI
 * of each tab with a 'file' scheme.
 */
export function getOpenTabsUris(): vscode.Uri[] {
    // de-dupe in case if they have a file open in two tabs
    const uris = new Map<string, vscode.Uri>()
    const tabGroups = vscode.window.tabGroups.all
    const openTabs = tabGroups.flatMap(group =>
        group.tabs.map(tab => tab.input)
    ) as vscode.TabInputText[]

    for (const tab of openTabs) {
        // Skip non-file URIs
        if (tab?.uri?.scheme === 'file') {
            uris.set(tab.uri.path, tab.uri)
        }
    }
    return Array.from(uris.values())
}

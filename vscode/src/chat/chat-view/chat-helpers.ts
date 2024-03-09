import * as vscode from 'vscode'

import { type RangeData, getDisplayText } from '@sourcegraph/cody-shared'

export async function openFile(
    uri: vscode.Uri,
    range?: RangeData,
    currentViewColumn?: vscode.ViewColumn
): Promise<void> {
    let viewColumn = vscode.ViewColumn.Beside
    if (currentViewColumn) {
        viewColumn = currentViewColumn - 1 || currentViewColumn + 1
    }
    const doc = await vscode.workspace.openTextDocument(uri)
    // +1 because selection range starts at 0 while editor line starts at 1
    const selection = range && new vscode.Range(range.start.line, 0, range.end.line + 1, 0)
    await vscode.window.showTextDocument(doc, {
        selection,
        viewColumn,
        preserveFocus: true,
        preview: true,
    })
}

export function getChatPanelTitle(lastHumanText?: string, truncateTitle = true): string {
    if (!lastHumanText) {
        return 'New Chat'
    }

    let displayText = getDisplayText({ speaker: 'human', text: lastHumanText })
    // Regex to remove the markdown formatted links with this format: '[_@FILENAME_]()'
    const MARKDOWN_LINK_REGEX = /\[_(.+?)_]\((.+?)\)/g
    displayText = displayText.replaceAll(MARKDOWN_LINK_REGEX, '$1')?.trim()
    if (!truncateTitle) {
        return displayText
    }
    // truncate title that is too long
    return displayText.length > 25 ? `${displayText.slice(0, 25).trim()}...` : displayText
}

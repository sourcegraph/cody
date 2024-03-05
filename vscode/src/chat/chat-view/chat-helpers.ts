import * as vscode from 'vscode'

import type { ContextItem, ContextMessage, RangeData } from '@sourcegraph/cody-shared'

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

// The approximate inverse of CodebaseContext.makeContextMessageWithResponse
export function contextMessageToContextItem(contextMessage: ContextMessage): ContextItem | null {
    if (!contextMessage.text) {
        return null
    }
    const contextText = stripContextWrapper(contextMessage.text)
    if (!contextText) {
        return null
    }
    if (!contextMessage.file) {
        return null
    }
    const range = contextMessage.file.range
    return {
        type: 'file',
        content: contextText,
        uri: contextMessage.file.uri,
        source: contextMessage.file.source,
        range:
            range &&
            new vscode.Range(
                range.start.line,
                range.start.character,
                range.end.line,
                range.end.character
            ),
        repoName: contextMessage.file.repoName,
        revision: contextMessage.file.revision,
        title: contextMessage.file.title,
    }
}

export function stripContextWrapper(text: string): string | undefined {
    {
        const start = text.indexOf('Use the following code snippet')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(2, -1).join('\n')
        }
    }
    {
        const start = text.indexOf('Use the following text from file')
        if (start >= 0) {
            text = text.slice(start)
            const lines = text.split('\n')
            return lines.slice(1).join('\n')
        }
    }
    {
        const start = text.indexOf('My selected ')
        const selectedStart = text.indexOf('<selected>')
        const selectedEnd = text.indexOf('</selected>')
        if (start >= 0 && selectedStart >= 0 && selectedEnd >= 0) {
            text = text.slice(selectedStart, selectedEnd)
            const lines = text.split('\n')
            return lines.slice(1, -1).join('\n')
        }
    }
    return undefined
}

export function getChatPanelTitle(lastDisplayText?: string, truncateTitle = true): string {
    if (!lastDisplayText) {
        return 'New Chat'
    }
    // Regex to remove the markdown formatted links with this format: '[_@FILENAME_]()'
    const MARKDOWN_LINK_REGEX = /\[_(.+?)_]\((.+?)\)/g
    lastDisplayText = lastDisplayText.replaceAll(MARKDOWN_LINK_REGEX, '$1')?.trim()
    if (!truncateTitle) {
        return lastDisplayText
    }
    // truncate title that is too long
    return lastDisplayText.length > 25 ? `${lastDisplayText.slice(0, 25).trim()}...` : lastDisplayText
}

export function viewRangeToRange(range?: RangeData): vscode.Range | undefined {
    if (!range) {
        return undefined
    }
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
}

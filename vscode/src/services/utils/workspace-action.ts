import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { ActiveTextEditorSelectionRange } from '@sourcegraph/cody-shared'

import { openUri } from '../../chat/chat-view/chat-helpers'

let workspaceRootUri = vscode.workspace.workspaceFolders?.[0]?.uri
let serverEndpoint = ''

export function workspaceActionsOnConfigChange(workspaceUri: vscode.Uri | null, endpoint?: string | null): void {
    if (workspaceUri) {
        workspaceRootUri = workspaceUri
    }
    if (endpoint) {
        serverEndpoint = endpoint
    }
}

/**
 * Open file in editor or in sourcegraph
 */
export async function openFilePath(
    filePath: string,
    uri?: URI,
    currentViewColumn?: vscode.ViewColumn,
    range?: ActiveTextEditorSelectionRange
): Promise<void> {
    if (!workspaceRootUri) {
        throw new Error('Failed to open file: missing workspace')
    }

    if (uri) {
        await openUri(uri, range, currentViewColumn)
        return
    }

    try {
        const workspaceFileUri = vscode.Uri.joinPath(workspaceRootUri, filePath)
        const doc = await vscode.workspace.openTextDocument(workspaceFileUri)
        const selection = range ? new vscode.Range(range.start.line, 0, range.end.line, 0) : range

        // Open file next to current webview panel column
        let viewColumn = vscode.ViewColumn.Beside
        if (currentViewColumn) {
            viewColumn = currentViewColumn - 1 || currentViewColumn + 1
        }

        await vscode.window.showTextDocument(doc, { selection, viewColumn, preserveFocus: false })
    } catch {
        // Try to open the file in the sourcegraph view
        const sourcegraphSearchURL = new URL(`/search?q=context:global+file:${filePath}`, serverEndpoint).href
        return openExternalLinks(sourcegraphSearchURL)
    }
}

/**
 * Open file in editor (assumed filePath is absolute) and optionally reveal a specific range
 */
export async function openLocalFileWithRange(filePath: string, range?: CodeRange): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
    const selection = range
        ? new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter)
        : range
    await vscode.window.showTextDocument(doc, { selection })
}

/**
 * Open external links
 */
export async function openExternalLinks(uri: string): Promise<void> {
    try {
        await vscode.env.openExternal(vscode.Uri.parse(uri))
    } catch (error) {
        throw new Error(`Failed to open file: ${error}`)
    }
}

interface CodeRange {
    startLine: number
    startCharacter: number
    endLine: number
    endCharacter: number
}

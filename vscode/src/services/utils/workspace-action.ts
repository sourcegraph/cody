import * as vscode from 'vscode'

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

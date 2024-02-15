import * as vscode from 'vscode'

/**
 * Open file in editor (assumed filePath is absolute) and optionally reveal a specific range
 */
export async function openLocalFileWithRange(filePath: string, range?: CodeRange): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
    const selection = range
        ? new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character)
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
    start: { line: number; character: number }
    end: { line: number; character: number }
}

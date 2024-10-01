import * as vscode from 'vscode'

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

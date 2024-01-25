import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

export async function getContextFileFromUri(file: URI): Promise<ContextFile | undefined> {
    try {
        const doc = await vscode.workspace.openTextDocument(file)
        const decoded = doc?.getText()
        const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS).trim()
        if (!decoded || !truncatedContent) {
            return
        }

        const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

        return {
            type: 'file',
            content: decoded,
            uri: file,
            source: 'editor',
            range,
        }
    } catch (error) {
        console.error(error)
        return
    }
}

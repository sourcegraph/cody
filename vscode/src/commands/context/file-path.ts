import {
    type ContextFile,
    MAX_CURRENT_FILE_TOKENS,
    truncateText,
    logError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Generate ContextFile for a file URI.
 */
export async function getContextFileFromUri(file: URI): Promise<ContextFile[]> {
    return wrapInActiveSpan('commands.context.filePath', async span => {
        try {
            const doc = await vscode.workspace.openTextDocument(file)
            const decoded = doc?.getText()
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS).trim()
            if (!decoded || !truncatedContent) {
                throw new Error('No file content')
            }

            const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

            return [
                {
                    type: 'file',
                    content: decoded,
                    uri: file,
                    source: 'editor',
                    range,
                },
            ]
        } catch (error) {
            logError('getContextFileFromUri', 'failed', { verbose: error })
            return []
        }
    })
}

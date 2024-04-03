import {
    type ContextItem,
    MAX_CURRENT_FILE_TOKENS,
    logError,
    truncateText,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { ContextItemSource } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Generate ContextFile for a file URI.
 */
export async function getContextFileFromUri(file: URI, range?: vscode.Range): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.filePath', async span => {
        try {
            const doc = await vscode.workspace.openTextDocument(file)
            const decoded = doc?.getText(range)
            const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS).trim()
            if (!decoded || !truncatedContent) {
                throw new Error('No file content')
            }

            const startLine = range?.start?.line ?? 0
            range = new vscode.Range(startLine, 0, startLine + truncatedContent.split('\n').length, 0)

            return [
                {
                    type: 'file',
                    content: decoded,
                    uri: file,
                    source: ContextItemSource.Editor,
                    range,
                },
            ] satisfies ContextItem[]
        } catch (error) {
            logError('getContextFileFromUri', 'failed', { verbose: error })
            return []
        }
    })
}

import {
    type ContextItem,
    ContextItemSource,
    TokenCounter,
    logError,
    toRangeData,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Generate ContextFile for a file URI.
 */
export async function getContextFileFromUri(file: URI, range?: vscode.Range): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.filePath', async span => {
        try {
            const doc = await vscode.workspace.openTextDocument(file)
            const content = doc?.getText(range).trim()
            if (!content) {
                throw new Error('No file content')
            }
            const endLine = Math.max(doc.lineCount - 1, 0)
            range = range ?? new vscode.Range(0, 0, endLine, 0)
            const size = TokenCounter.countTokens(content)

            return [
                {
                    type: 'file',
                    content,
                    uri: file,
                    source: ContextItemSource.Editor,
                    range: toRangeData(range),
                    size,
                },
            ] satisfies ContextItem[]
        } catch (error) {
            logError('getContextFileFromUri', 'failed', { verbose: error })
            return []
        }
    })
}

import {
    type ContextItem,
    ContextItemSource,
    TokenCounter,
    contextFiltersProvider,
    logError,
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
            if (await contextFiltersProvider.isUriIgnored(file)) {
                return []
            }

            const doc = await vscode.workspace.openTextDocument(file)
            const content = doc?.getText(range).trim()
            if (!content) {
                throw new Error('No file content')
            }

            const startLine = range?.start?.line ?? 0
            range = new vscode.Range(startLine, 0, startLine + content.split('\n').length, 0)
            const size = TokenCounter.countTokens(content)

            return [
                {
                    type: 'file',
                    content,
                    uri: file,
                    source: ContextItemSource.Editor,
                    range,
                    size,
                },
            ] satisfies ContextItem[]
        } catch (error) {
            logError('getContextFileFromUri', 'failed', { verbose: error })
            return []
        }
    })
}

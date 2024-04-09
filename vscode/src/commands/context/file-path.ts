import {
    type ContextItem,
    ContextItemSource,
    TokenCounter,
    USER_CONTEXT_TOKEN_BUDGET,
    USER_CONTEXT_TOKEN_BUDGET_IN_BYTES,
    logError,
    truncateText,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { tokensToBytes } from '@sourcegraph/cody-shared/src/token/utils'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Generate ContextFile for a file URI.
 */
export async function getContextFileFromUri(file: URI, range?: vscode.Range): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.filePath', async span => {
        try {
            const doc = await vscode.workspace.openTextDocument(file)
            const decoded = doc?.getText(range).trim()
            const truncatedContent = truncateText(decoded, USER_CONTEXT_TOKEN_BUDGET_IN_BYTES).trim()
            if (!decoded) {
                throw new Error('No file content')
            }

            const startLine = range?.start?.line ?? 0
            range = new vscode.Range(startLine, 0, startLine + truncatedContent.split('\n').length, 0)
            const tokenCount = TokenCounter.countTokens(truncatedContent)
            const size = tokensToBytes(tokenCount)

            return [
                {
                    type: 'file',
                    content: truncatedContent,
                    uri: file,
                    source: ContextItemSource.Editor,
                    range,
                    size,
                    isTooLarge: USER_CONTEXT_TOKEN_BUDGET < tokenCount,
                },
            ] satisfies ContextItem[]
        } catch (error) {
            logError('getContextFileFromUri', 'failed', { verbose: error })
            return []
        }
    })
}

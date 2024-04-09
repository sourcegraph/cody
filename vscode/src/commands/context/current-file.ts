import {
    type ContextItem,
    ContextItemSource,
    TokenCounter,
    USER_CONTEXT_TOKEN_BUDGET,
    logError,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'

export async function getContextFileFromCurrentFile(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.file', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document
            if (!document) {
                throw new Error('No active editor')
            }

            const selection = new vscode.Selection(
                0,
                0,
                document.lineCount - 1,
                document.lineAt(document.lineCount - 1).text.length
            )

            const content = document.getText(selection)
            const size = TokenCounter.countTokens(content)

            if (!content.trim()) {
                throw new Error('No content')
            }

            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content,
                    source: ContextItemSource.Editor,
                    range: selection,
                    size,
                    isTooLarge: USER_CONTEXT_TOKEN_BUDGET < size,
                } satisfies ContextItem,
            ]
        } catch (error) {
            logError('getContextFileFromCurrentFile', 'failed', { verbose: error })
            return []
        }
    })
}

import {
    type ContextItem,
    ContextItemSource,
    USER_CONTEXT_TOKEN_BUDGET_IN_BYTES,
    logError,
    truncateText,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'

export async function getContextFileFromCurrentFile(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.file', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document
            if (!editor?.active || !document) {
                throw new Error('No active editor')
            }

            const selection = new vscode.Selection(
                0,
                0,
                document.lineCount - 1,
                document.lineAt(document.lineCount - 1).text.length
            )

            const content = document.getText(selection)

            if (!content.trim()) {
                throw new Error('No content')
            }

            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content: truncateText(content, USER_CONTEXT_TOKEN_BUDGET_IN_BYTES),
                    source: ContextItemSource.Editor,
                    range: selection,
                    isTooLarge: content.length > USER_CONTEXT_TOKEN_BUDGET_IN_BYTES,
                } satisfies ContextItem,
            ]
        } catch (error) {
            logError('getContextFileFromCurrentFile', 'failed', { verbose: error })
            return []
        }
    })
}

import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import * as vscode from 'vscode'

export async function getContextFileFromFile(): Promise<ContextFile | undefined> {
    const editor = getEditor()
    const document = editor?.active?.document

    if (!editor?.active || !document) {
        return undefined
    }

    // get the current file length as selection
    const selection = new vscode.Selection(
        1,
        0,
        document.lineCount,
        document.lineAt(document.lineCount - 1).text.length
    )

    const content = document.getText(selection)

    if (!content.trim()) {
        return undefined
    }

    return {
        type: 'file',
        uri: document.uri,
        content: truncateText(content, MAX_CURRENT_FILE_TOKENS),
        source: 'editor',
        range: selection,
    } as ContextFile
}

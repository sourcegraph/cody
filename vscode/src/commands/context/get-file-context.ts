import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import * as vscode from 'vscode'

export async function getContextFileFromFile(): Promise<ContextFile | undefined> {
    const editor = getEditor()
    const document = editor?.active?.document

    if (!editor?.active || editor?.ignored) {
        const message = editor.ignored
            ? 'Current file is ignored by a .cody/ignore file. Please remove it from the list and try again.'
            : 'No editor is active. Please open a file and try again.'
        void vscode.window.showErrorMessage(message)
        return
    }

    if (!editor || !document) {
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
        source: 'selection',
        range: selection,
    } as ContextFile
}

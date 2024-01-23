import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'
import * as vscode from 'vscode'

export async function getContextFileFromCursor(): Promise<ContextFile | undefined> {
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

    const selection = editor.active.selection
    const smartSelection = await getSmartSelection(document?.uri, selection?.start.line)
    const content = document.getText(smartSelection ?? selection)

    return {
        type: 'file',
        uri: document.uri,
        content: truncateText(content, MAX_CURRENT_FILE_TOKENS),
        source: 'selection',
        range: selection,
    } as ContextFile
}

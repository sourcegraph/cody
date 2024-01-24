import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'
import * as vscode from 'vscode'

/**
 * Gets context file content from the current editor selection.
 *
 * When no selection is made, try getting the smart selection based on the cursor position.
 * If no smart selection is found, use the visible range of the editor instead.
 */
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

    const cursor = editor.active.selection
    const smartSelection = await getSmartSelection(document?.uri, cursor?.start.line)

    const selection = smartSelection
        ? new vscode.Selection(
              smartSelection?.start.line + 1,
              smartSelection?.start.character,
              smartSelection?.end.line + 1,
              smartSelection?.end.character
          )
        : editor.active.visibleRanges[0]

    const content = document.getText(selection)

    return {
        type: 'file',
        uri: document.uri,
        content: truncateText(content, MAX_CURRENT_FILE_TOKENS),
        source: 'selection',
        range: selection,
    } as ContextFile
}

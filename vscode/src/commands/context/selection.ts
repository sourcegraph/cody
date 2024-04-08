import {
    type ContextItem,
    ContextItemSource,
    MAX_CURRENT_FILE_TOKENS,
    logError,
    truncateText,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'

import { type Position, Selection } from 'vscode'
/**
 * Gets context file content from the current editor selection.
 *
 * When no selection is made, try getting the smart selection based on the cursor position.
 * If no smart selection is found, use the visible range of the editor instead.
 */
export async function getContextFileFromCursor(newCursorPosition?: Position): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.selection', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document

            if (!editor?.active || !document) {
                throw new Error('No active editor')
            }

            // Use user current selection if any
            // Else, use smart selection based on cursor position
            // Else, use visible range of the editor that contains the cursor as fallback
            const activeCursor = newCursorPosition && new Selection(newCursorPosition, newCursorPosition)
            const cursor = activeCursor ?? editor.active.selection
            const smartSelection = await getSmartSelection(document?.uri, cursor?.start)
            const activeSelection = !cursor?.start.isEqual(cursor?.end) ? cursor : smartSelection
            const visibleRange = editor.active.visibleRanges.find(range => range.contains(cursor?.start))
            const selection = activeSelection ?? visibleRange

            const content = document.getText(selection)

            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content: truncateText(content, MAX_CURRENT_FILE_TOKENS),
                    source: ContextItemSource.Selection,
                    range: selection,
                } satisfies ContextItem,
            ]
        } catch (error) {
            logError('getContextFileFromCursor', 'failed', { verbose: error })
            return []
        }
    })
}

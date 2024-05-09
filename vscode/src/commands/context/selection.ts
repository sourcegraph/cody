import {
    type ContextItem,
    TokenCounter,
    contextFiltersProvider,
    logError,
    toRangeData,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { type ContextItemFile, ContextItemSource } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'

import { type Position, Selection } from 'vscode'

/**
 * Gets context file content from the cursor position in the active editor.
 *
 * When no selection is made, try getting the smart selection based on the cursor position.
 * If no smart selection is found, use the visible range of the editor instead.
 */
export async function getContextFileFromCursor(newCursorPosition?: Position): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.cursor', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document

            if (!editor?.active || !document) {
                throw new Error('No active editor')
            }

            if (await contextFiltersProvider.isUriIgnored(document.uri)) {
                return []
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
            const size = TokenCounter.countTokens(content)

            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content,
                    source: ContextItemSource.Selection,
                    range: toRangeData(selection),
                    size,
                } satisfies ContextItemFile,
            ]
        } catch (error) {
            logError('getContextFileFromCursor', 'failed', { verbose: error })
            return []
        }
    })
}

/**
 * Gets context file content from the current selection in the active editor if any.
 */
export async function getContextFileFromSelection(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.selection', async span => {
        try {
            const editor = getEditor()?.active
            const document = editor?.document
            const selection = editor?.selection
            if (!document || !selection) {
                throw new Error('No active selection in active editor')
            }

            if (await contextFiltersProvider.isUriIgnored(document.uri)) {
                return []
            }

            const content = editor.document.getText(selection)
            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content,
                    source: ContextItemSource.Selection,
                    range: toRangeData(selection),
                    size: TokenCounter.countTokens(content),
                } satisfies ContextItemFile,
            ]
        } catch (error) {
            logError('getContextFileFromCursor', 'failed', { verbose: error })
            return []
        }
    })
}

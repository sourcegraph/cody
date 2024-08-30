import {
    type ContextItem,
    TokenCounterUtils,
    contextFiltersProvider,
    isCodyIgnoredFile,
    logError,
    toRangeData,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { type ContextItemFile, ContextItemSource } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getSmartSelection } from '../../editor/utils'

import { type Position, Selection } from 'vscode'
import type { URI } from 'vscode-uri'

/**
 * Gets context file content from the cursor position in the active editor.
 *
 * When no selection is made, try getting the smart selection based on the cursor position.
 * If no smart selection is found, use the visible range of the editor instead.
 */
export async function getContextFileFromCursor(
    newCursorPosition?: Position
): Promise<ContextItem | null> {
    return wrapInActiveSpan('commands.context.cursor', async span => {
        try {
            const editor = getEditor()
            const document = editor?.active?.document

            if (!editor?.active || !document) {
                throw new Error('No active editor')
            }

            if (await contextFiltersProvider.instance!.isUriIgnored(document.uri)) {
                return null
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
            const size = await TokenCounterUtils.countTokens(content)

            return {
                type: 'file',
                uri: document.uri,
                content,
                source: ContextItemSource.Selection,
                range: toRangeData(selection),
                size,
            }
        } catch (error) {
            logError('getContextFileFromCursor', 'failed', { verbose: error })
            return null
        }
    })
}

/**
 * Gets the context items for the current selection in the active editor.
 *
 * If the file is ignored or if no selection, an empty array is returned.
 *
 * @returns An array of context items for the current selection.
 */
export async function getContextFileFromSelection(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.selection', async span => {
        const editor = getEditor()?.active
        const document = editor?.document
        const selection = editor?.selection

        if (!document || selection?.isEmpty || (await shouldIgnore(document.uri))) {
            return []
        }

        try {
            const content = document.getText(selection)
            return [
                {
                    type: 'file',
                    uri: document.uri,
                    content,
                    source: ContextItemSource.Selection,
                    range: toRangeData(selection),
                    size: await TokenCounterUtils.countTokens(content),
                } satisfies ContextItemFile,
            ]
        } catch (error) {
            logError('getContextFileFromSelection', 'failed', { verbose: error })
            return []
        }
    })
}

/**
 * Gets the context items for the current selection in the active editor, or the entire file if there is no selection.
 *
 * The context items include the file URI, content, source (selection or file), range, and token count.
 * If the file is ignored, an empty array is returned.
 *
 * @returns An array of context items for the current selection or file.
 */
export async function getSelectionOrFileContext(): Promise<ContextItem[]> {
    return wrapInActiveSpan('commands.context.selection_file', async span => {
        const editor = getEditor()?.active
        const document = editor?.document
        const selection = editor?.selection

        if (!document || !selection || (await shouldIgnore(document.uri))) {
            return []
        }

        // If the selection is empty, use the entire file content
        const range = selection.start.isEqual(selection.end) ? undefined : selection
        const content = editor.document.getText(range)

        return [
            {
                type: 'file',
                uri: document.uri,
                content,
                source: ContextItemSource.Selection,
                range: range && toRangeData(range),
                size: await TokenCounterUtils.countTokens(content),
            } satisfies ContextItemFile,
        ]
    })
}

async function shouldIgnore(uri: URI): Promise<boolean> {
    return Boolean((await contextFiltersProvider.instance!.isUriIgnored(uri)) || isCodyIgnoredFile(uri))
}

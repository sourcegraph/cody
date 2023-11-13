import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'

import { CodyVSCodeTextEditor } from './vscode-editor'

/**
 * Gets the currently active text editor instance if available.
 * Returns undefined if no editor is active.
 *
 * NOTE: This handles edge case where activeTextEditor API returns undefined when webview panel has focus.
 */
let lastTrackedTextEditor: CodyVSCodeTextEditor | undefined

// Support file, untitled, and notebooks
const validFileSchemes = new Set(['file', 'untitled', 'vscode-notebook', 'vscode-notebook-cell'])

export function getActiveEditor(): CodyVSCodeTextEditor | undefined {
    // When there is no active editor, reset lastTrackedTextEditor
    const activeEditors = vscode.window.visibleTextEditors
    if (!activeEditors.length) {
        lastTrackedTextEditor = undefined
        return undefined
    }

    // When the webview panel is focused, calling activeTextEditor will return undefined.
    // This allows us to get the active editor before the webview panel is focused.
    const get = (): CodyVSCodeTextEditor | undefined => {
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor?.document.uri.scheme) {
            if (validFileSchemes.has(activeEditor.document.uri.scheme)) {
                lastTrackedTextEditor = activeEditor as CodyVSCodeTextEditor
            }
        }

        return lastTrackedTextEditor
            ? {
                  ...lastTrackedTextEditor,
                  isIgnored: lastTrackedTextEditor?.document
                      ? isCodyIgnoredFile(lastTrackedTextEditor.document.uri)
                      : undefined,
              }
            : undefined
    }

    return get()
}

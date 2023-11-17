import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'

/**
 * This returns the current active text editor instance if available, along with a boolean indicating if the text editor is on the Cody ignored list
 * Returns undefined if no editor is active.
 *
 * NOTE: ALL users in VS code should use this instead of 'vscode.window.activeTextEditor' to get the correct Active Editor as this handles edge case where the activeTextEditor API will always return 'undefined' when user is focused on the webview chat panel
 */
let lastActiveTextEditor: LastTextEditor = { active: undefined, ignored: false }

// Support file, untitled, and notebooks
const validFileSchemes = new Set(['file', 'untitled', 'vscode-notebook', 'vscode-notebook-cell'])

export function getEditor(): LastTextEditor {
    // When the webview panel is focused, calling activeTextEditor will return undefined.
    // This allows us to get the active editor before the webview panel is focused.
    const get = (): LastTextEditor => {
        // When there is no active editor, reset lastValidTextEditor
        const activeEditors = vscode.window.visibleTextEditors
        if (!activeEditors.length) {
            // lastValidTextEditor = undefined
            lastActiveTextEditor = { active: undefined, ignored: false }
            return lastActiveTextEditor
        }

        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor?.document.uri) {
            if (validFileSchemes.has(activeEditor.document.uri.scheme)) {
                lastActiveTextEditor.active = activeEditor
                lastActiveTextEditor.ignored = isCodyIgnoredFile(activeEditor?.document.uri)

                return lastActiveTextEditor
            }
        }
        return lastActiveTextEditor
    }

    return get()
}

interface LastTextEditor {
    active?: vscode.TextEditor
    ignored?: boolean
}

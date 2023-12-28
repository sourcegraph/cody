import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'

/**
 * Interface for tracking the last active text editor that is not a webview panel for
 * the new Chat Panel UI.
 *
 * active: The current valid active/supported text editor instance.
 * ignored: Whether the active editor is ignored by Cody or not.
 */
interface LastActiveTextEditor {
    active?: vscode.TextEditor
    ignored?: boolean
}

/**
 * This returns the current active text editor instance if available,
 * along with a boolean indicating if the text editor is on the Cody ignored list.
 * Returns undefined if no editor is active.
 *
 * NOTE: ALL USERS of chat interface in VS Code should use this to get the correct Active Editor instead of using
 * 'vscode.window.activeTextEditor' as this handles cases where the activeTextEditor API will always return
 * 'undefined' when user is focused on the webview chat panel.
 *
 * NOTE: Users that operate within an actual text editor (non-webview panels) do not need to use this API as calling
 * 'vscode.window.activeTextEditor' from the text editor will always return the correct active editor.
 */
let lastActiveTextEditor: LastActiveTextEditor = { active: undefined, ignored: false }

// Support file, untitled, and notebooks
const validFileSchemes = new Set(['file', 'untitled', 'vscode-notebook', 'vscode-notebook-cell'])

// When the webview panel is focused, calling activeTextEditor will return undefined.
// This allows us to keep using the last active editor before the webview panel became the active editor
export function getEditor(): LastActiveTextEditor {
    // If there is no visible text editors, then we don't have an active editor
    const activeEditors = vscode.window.visibleTextEditors
    if (!activeEditors.length) {
        lastActiveTextEditor = { active: undefined, ignored: false }
        return lastActiveTextEditor
    }

    // When the webview panel is focused, calling activeTextEditor will return undefined.
    // This allows us to get the active editor before the webview panel is focused.
    const get = (): LastActiveTextEditor => {
        // Check if the active editor is:
        // a. a file that cody supports
        // b. a file that is ignored by Cody
        const activeEditor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]
        if (activeEditor?.document.uri.scheme) {
            // Update the lastActiveTextEditor if the active editor is a valid file
            if (validFileSchemes.has(activeEditor.document.uri.scheme)) {
                lastActiveTextEditor.active = activeEditor
                lastActiveTextEditor.ignored = isCodyIgnoredFile(activeEditor?.document.uri)
            }
        }
        return lastActiveTextEditor
    }

    return get()
}

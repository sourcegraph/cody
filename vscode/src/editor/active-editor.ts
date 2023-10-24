import * as vscode from 'vscode'

/**
 * Gets the currently active text editor instance if available.
 * Returns undefined if no editor is active.
 *
 * NOTE: This handles edge case where activeTextEditor API returns undefined when webview panel has focus.
 */
let lastTrackedTextEditor: vscode.TextEditor | undefined

export function getActiveEditor(): vscode.TextEditor | undefined {
    // When there is no active editor, reset lastTrackedTextEditor
    const activeEditors = vscode.window.visibleTextEditors
    if (!activeEditors.length) {
        lastTrackedTextEditor = undefined
        return undefined
    }

    // When webview panel is focus, calling activeTextEditor will return undefined.
    // This allows us to get the active editor before the webview panel is focused.
    const get = (): vscode.TextEditor | undefined => {
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor?.document.uri.scheme === 'file') {
            lastTrackedTextEditor = activeEditor
        }
        return activeEditor || lastTrackedTextEditor
    }

    return get()
}

/**
 * Callback function that calls getActiveEditor() whenever the visible text editors change in VS Code.
 * This allows tracking of the currently active text editor even when focus moves to something like a webview panel.
 */
vscode.window.onDidChangeVisibleTextEditors(() => getActiveEditor())

import * as vscode from 'vscode'

export function getEditorInsertSpaces(uri: vscode.Uri): boolean {
    const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === uri)
    if (!editor) {
        // Default to the same as VS Code default
        return true
    }

    const { languageId } = editor.document
    const languageConfig = vscode.workspace.getConfiguration(`[${languageId}]`, uri)
    const languageSetting = languageConfig.get('editor.insertSpaces') as boolean | undefined
    // Prefer language specific setting.
    const insertSpaces = languageSetting || editor.options.insertSpaces

    // This should never happen: "When getting a text editor's options, this property will always be a boolean (resolved)."
    if (typeof insertSpaces === 'string' || insertSpaces === undefined) {
        console.error('Unexpected value when getting "insertSpaces" for the current editor.')
        return true
    }

    return insertSpaces
}

export function getEditorTabSize(uri: vscode.Uri): number {
    const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === uri)
    if (!editor) {
        // Default to the same as VS Code default
        return 4
    }

    const { languageId } = editor.document
    const languageConfig = vscode.workspace.getConfiguration(`[${languageId}]`, uri)
    const languageSetting = languageConfig.get<number>('editor.tabSize')
    // Prefer language specific setting.
    const tabSize = languageSetting || editor.options.tabSize

    // This should never happen: "When getting a text editor's options, this property will always be a number (resolved)."
    if (typeof tabSize === 'string' || tabSize === undefined) {
        console.error('Unexpected value when getting "tabSize" for the current editor.')
        return 4
    }

    return tabSize
}

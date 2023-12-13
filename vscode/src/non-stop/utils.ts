import * as vscode from 'vscode'

export enum CodyTaskState {
    'idle' = 1,
    'working' = 2,
    'inserting' = 3,
    'applying' = 4,
    'formatting' = 5,
    'applied' = 6,
    'finished' = 7,
    'error' = 8,
}

export type CodyTaskList = {
    [key in CodyTaskState]: {
        id: string
        icon: string
        description: string
    }
}

/**
 * Icon for each task state
 */
export const fixupTaskList: CodyTaskList = {
    [CodyTaskState.idle]: {
        id: 'idle',
        icon: 'clock',
        description: 'Initial state',
    },
    [CodyTaskState.working]: {
        id: 'working',
        icon: 'sync~spin',
        description: 'Cody is preparing a response',
    },
    [CodyTaskState.inserting]: {
        id: 'inserting',
        icon: 'pencil',
        description: 'The edit is being inserted to the document',
    },
    [CodyTaskState.applying]: {
        id: 'applying',
        icon: 'pencil',
        description: 'The edit is being applied to the document',
    },
    [CodyTaskState.formatting]: {
        id: 'formatting',
        icon: 'pencil',
        description: 'The edit is being formatted in the document',
    },
    [CodyTaskState.applied]: {
        id: 'applied',
        icon: 'pass-filled',
        description: 'Suggestions from Cody have been applied',
    },
    [CodyTaskState.finished]: {
        id: 'finished',
        icon: 'pass-filled',
        description: 'The edit has been resolved and is no longer visible in the document',
    },
    [CodyTaskState.error]: {
        id: 'error',
        icon: 'stop',
        description: 'The task failed',
    },
}

/**
 * Get the last part of the file path after the last slash
 */
export function getFileNameAfterLastDash(filePath: string): string {
    const lastDashIndex = filePath.lastIndexOf('/')
    if (lastDashIndex === -1) {
        return filePath
    }
    return filePath.slice(lastDashIndex + 1)
}

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
    const languageSetting = languageConfig.get('editor.tabSize') as number | undefined
    // Prefer language specific setting.
    const tabSize = languageSetting || editor.options.tabSize

    // This should never happen: "When getting a text editor's options, this property will always be a number (resolved)."
    if (typeof tabSize === 'string' || tabSize === undefined) {
        console.error('Unexpected value when getting "tabSize" for the current editor.')
        return 4
    }

    return tabSize
}

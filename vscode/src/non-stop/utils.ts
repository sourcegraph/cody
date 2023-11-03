import * as vscode from 'vscode'

export enum CodyTaskState {
    'idle' = 1,
    'working' = 2,
    'applying' = 3,
    'formatting' = 4,
    'applied' = 5,
    'finished' = 6,
    'error' = 7,
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

export function getEditorInsertSpaces(): boolean {
    if (!vscode.window.activeTextEditor) {
        // Default to the same as VS Code default
        return true
    }

    const { insertSpaces } = vscode.window.activeTextEditor.options

    // This should never happen: "When getting a text editor's options, this property will always be a boolean (resolved)."
    if (typeof insertSpaces === 'string' || insertSpaces === undefined) {
        console.error('Unexpected value when getting "insertSpaces" for the current editor.')
        return true
    }

    return insertSpaces
}

export function getEditorTabSize(): number {
    if (!vscode.window.activeTextEditor) {
        // Default to the same as VS Code default
        return 4
    }

    const { tabSize } = vscode.window.activeTextEditor.options

    // This should never happen: "When getting a text editor's options, this property will always be a number (resolved)."
    if (typeof tabSize === 'string' || tabSize === undefined) {
        console.error('Unexpected value when getting "tabSize" for the current editor.')
        return 4
    }

    return tabSize
}

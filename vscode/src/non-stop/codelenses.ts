import * as vscode from 'vscode'

import { getSingleLineRange } from '../services/InlineAssist'

import { FixupTask } from './FixupTask'
import { CodyTaskState } from './utils'

// Create Lenses based on state
export function getLensesForTask(task: FixupTask): vscode.CodeLens[] {
    const codeLensRange = getSingleLineRange(task.selectionRange.start.line)
    switch (task.state) {
        case CodyTaskState.working: {
            const title = getWorkingLens(codeLensRange)
            const cancel = getCancelLens(codeLensRange, task.id)
            return [title, cancel]
        }
        case CodyTaskState.applying: {
            const title = getApplyingLens(codeLensRange)
            return [title]
        }
        case CodyTaskState.applied: {
            const title = getAppliedLens(codeLensRange)
            const diff = getDiffLens(codeLensRange, task.id)
            const done = getDoneLens(codeLensRange, task.id)
            return [title, diff, done]
        }
        case CodyTaskState.error: {
            const title = getErrorLens(codeLensRange)
            const discard = getDiscardLens(codeLensRange, task.id)
            return [title, discard]
        }
        default:
            return []
    }
}

// List of lenses
// TODO: Replace cody.focus with appropriate tasks
// TODO (bea) send error messages to the chat UI so that they can see the task progress in the chat and chat history
function getErrorLens(codeLensRange: vscode.Range): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(warning) Applying edits failed',
        command: 'cody.focus',
    }
    return lens
}

function getWorkingLens(codeLensRange: vscode.Range): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Cody is working...',
        command: 'cody.focus',
    }
    return lens
}

function getApplyingLens(codeLensRange: vscode.Range): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Applying...',
        command: 'cody.focus',
    }
    return lens
}

function getCancelLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: 'Cancel',
        command: 'cody.fixup.codelens.cancel',
        arguments: [id],
    }
    return lens
}

function getDiscardLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: 'Discard',
        command: 'cody.fixup.codelens.cancel',
        arguments: [id],
    }
    return lens
}

function getAppliedLens(codeLensRange: vscode.Range): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '✨ Edited by Cody',
        command: '',
    }
    return lens
}

function getDiffLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: 'Diff',
        command: 'cody.fixup.codelens.diff',
        arguments: [id],
    }
    return lens
}

function getUndoLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: 'Undo',
        command: 'cody.fixup.codelens.undo',
        arguments: [id],
    }
    return lens
}

function getDoneLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: 'Done',
        command: 'cody.fixup.codelens.cancel',
        arguments: [id],
    }
    return lens
}

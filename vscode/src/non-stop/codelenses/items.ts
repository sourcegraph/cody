import * as vscode from 'vscode'

import { isRateLimitError } from '@sourcegraph/cody-shared'

import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { FixupTask } from '../FixupTask'
import { CodyTaskState } from '../utils'

// Create Lenses based on state
export function getLensesForTask(task: FixupTask): vscode.CodeLens[] {
    const codeLensRange = new vscode.Range(task.selectionRange.start, task.selectionRange.start)
    const isTest = task.intent === 'test'
    const isEdit = task.mode === 'edit'
    switch (task.state) {
        case CodyTaskState.Pending:
        case CodyTaskState.Working: {
            const title = getWorkingLens(codeLensRange, task.id)
            const cancel = getCancelLens(codeLensRange, task.id)
            return [title, cancel]
        }
        case CodyTaskState.Inserting: {
            if (isTest) {
                return [getUnitTestLens(codeLensRange, task.id)]
            }
            return [getInsertingLens(codeLensRange, task.id), getCancelLens(codeLensRange, task.id)]
        }
        case CodyTaskState.Applying: {
            const title = getApplyingLens(codeLensRange, task.id)
            const cancel = getCancelLens(codeLensRange, task.id)
            return [title, cancel]
        }
        case CodyTaskState.Applied: {
            const accept = getAcceptLens(codeLensRange, task.id)
            const retry = getRetryLens(codeLensRange, task.id)
            const undo = getUndoLens(codeLensRange, task.id)
            if (isTest) {
                return [accept, undo]
            }
            if (isEdit) {
                const showDiff = getDiffLens(
                    codeLensRange,
                    task.id,
                    // Note: We already show an inline-diff in VS Code, so we change the wording slightly.
                    // It is still useful to open the diff fully here, as it provides additional controls such as
                    // reverting specific lines
                    isRunningInsideAgent() ? 'Show Diff' : 'Open Diff'
                )
                return [accept, retry, undo, showDiff]
            }
            return [accept, retry, undo]
        }
        case CodyTaskState.Error: {
            const title = getErrorLens(codeLensRange, task)
            const discard = getDiscardLens(codeLensRange, task.id)
            return [title, discard]
        }
        default:
            return []
    }
}

// List of lenses
function getErrorLens(codeLensRange: vscode.Range, task: FixupTask): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    if (isRateLimitError(task.error)) {
        if (task.error.upgradeIsAvailable) {
            lens.command = {
                title: '⚡️ Upgrade to Cody Pro',
                command: 'cody.show-rate-limit-modal',
                arguments: [
                    task.error.userMessage,
                    task.error.retryMessage,
                    task.error.upgradeIsAvailable,
                ],
            }
        } else {
            lens.command = {
                title: '$(warning) Rate Limit Exceeded',
                command: 'cody.show-rate-limit-modal',
                arguments: [
                    task.error.userMessage,
                    task.error.retryMessage,
                    task.error.upgradeIsAvailable,
                ],
            }
        }
    } else {
        lens.command = {
            title: '$(warning) Applying Edits Failed',
            command: 'cody.fixup.codelens.error',
            arguments: [task.id],
        }
    }
    return lens
}

function getWorkingLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Cody is working...',
        command: 'cody.chat.focus',
        arguments: [id],
    }
    return lens
}

function getInsertingLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Inserting...',
        command: 'cody.chat.focus',
        arguments: [id],
    }
    return lens
}

function getApplyingLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Applying...',
        command: 'cody.chat.focus',
        arguments: [id],
    }
    return lens
}

function getCancelLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥Z' : 'Alt+Z'})`
    lens.command = {
        title: `Cancel${shortcut}`,
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

function getDiffLens(codeLensRange: vscode.Range, id: string, title: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title,
        command: 'cody.fixup.codelens.diff',
        arguments: [id],
    }
    return lens
}

function getRetryLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥R' : 'Alt+R'})`
    lens.command = {
        title: `Edit & Retry${shortcut}`,
        command: 'cody.fixup.codelens.retry',
        arguments: [id],
    }
    return lens
}

function getUndoLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥X' : 'Alt+X'})`
    lens.command = {
        title: `Undo${shortcut}`,
        command: 'cody.fixup.codelens.undo',
        arguments: [id],
    }
    return lens
}

function getAcceptLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥A' : 'Alt+A'})`
    lens.command = {
        title: `$(cody-logo) Accept${shortcut}`,
        command: 'cody.fixup.codelens.accept',
        arguments: [id],
    }
    return lens
}

function getUnitTestLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    lens.command = {
        title: '$(sync~spin) Generating tests...',
        command: 'cody.chat.focus',
        arguments: [id],
    }
    return lens
}

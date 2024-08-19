import * as vscode from 'vscode'

import { isRateLimitError } from '@sourcegraph/cody-shared'

import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import type { FixupTask } from '../FixupTask'
import { CodyTaskState } from '../state'
import { getChunkedEditRanges } from './utils'

// Create Lenses based on state
export function getLensesForTask(task: FixupTask): vscode.CodeLens[] {
    const codeLensRange = new vscode.Range(task.selectionRange.start, task.selectionRange.start)
    const isAgent = isRunningInsideAgent()
    const isChatEdit = task.source === 'chat'
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
            // Optional:
            // Retries only makes sense if the user created the prompt
            const canRetry = task.intent !== 'fix' && task.intent !== 'doc' && !isTest && !isChatEdit
            const retryLens = canRetry ? getRetryLens(codeLensRange, task.id) : null

            // Diffs only if there's code that's changed
            const canDiff = isEdit && !isTest
            const diffLens = canDiff
                ? getDiffLens(
                      codeLensRange,
                      task.id,
                      // Note: We already show an inline-diff in VS Code, so we change the wording slightly.
                      // It is still useful to open the diff fully here, as it provides additional controls such as
                      // reverting specific lines
                      isAgent ? 'Show Diff' : 'Open Diff'
                  )
                : null

            // Show additional accept/reject lenses against change blocks when we have a diff.
            // Currently only supported in VS Code. Need to test and ensure this change works
            // well in JetBrains/other clients before enabling in Agent
            // Note: We check that the diff has at least 2 or more changes here, otherwise we will just be showing a
            // duplicate of the top Accept/Reject lens. We just the _originalDiff_ so we don't automatically hide the
            // final Accept/Reject lens if a user is rejecting multiple
            const canShowIndividualAcceptRejectLenses =
                canDiff && !isAgent && getChunkedEditRanges(task.originalDiff).length > 1

            const chunkedRanges = canShowIndividualAcceptRejectLenses
                ? getChunkedEditRanges(task.diff)
                : []
            const acceptChangeLenses = canShowIndividualAcceptRejectLenses
                ? getAcceptLenses(task, chunkedRanges)
                : []
            const rejectChangeLenses = canShowIndividualAcceptRejectLenses
                ? getRejectLenses(task, chunkedRanges)
                : []

            // Required:
            // Accept: If we are in VS Code and we have multiple chunked ranges, we will show multiple accept/reject lenses.
            // In this case, we will show "Accept All". Otherwise we just show "Accept"
            const acceptLens =
                isAgent || chunkedRanges.length <= 1
                    ? getAcceptLens(codeLensRange, task.id)
                    : getAcceptAllLens(codeLensRange, task.id)
            const undoLens =
                isAgent || chunkedRanges.length <= 1
                    ? getRejectLens(codeLensRange, task.id)
                    : getRejectAllLens(codeLensRange, task.id)

            return (
                [
                    acceptLens,
                    retryLens,
                    undoLens,
                    diffLens,
                    ...acceptChangeLenses,
                    ...rejectChangeLenses,
                ] as vscode.CodeLens[]
            ).filter(Boolean) //TODO: Remove type-cast after TS5.5+
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

function getRejectLenses(task: FixupTask, ranges: vscode.Range[]): vscode.CodeLens[] {
    const lenses = []
    for (const range of ranges) {
        const acceptBlockLens = new vscode.CodeLens(range)
        acceptBlockLens.command = {
            title: 'Reject',
            command: 'cody.fixup.codelens.rejectChange',
            arguments: [task.id, range],
        }
        lenses.push(acceptBlockLens)
    }
    return lenses
}

function getAcceptLenses(task: FixupTask, ranges: vscode.Range[]): vscode.CodeLens[] {
    const lenses = []
    for (const range of ranges) {
        const acceptBlockLens = new vscode.CodeLens(range)
        acceptBlockLens.command = {
            title: 'Accept',
            command: 'cody.fixup.codelens.acceptChange',
            arguments: [task.id, range],
        }
        lenses.push(acceptBlockLens)
    }
    return lenses
}

function getRejectLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥X' : 'Alt+X'})`
    lens.command = {
        title: `Reject${shortcut}`,
        command: 'cody.fixup.codelens.undo',
        arguments: [id],
    }
    return lens
}

function getRejectAllLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥X' : 'Alt+X'})`
    lens.command = {
        title: `Reject All${shortcut}`,
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

function getAcceptAllLens(codeLensRange: vscode.Range, id: string): vscode.CodeLens {
    const lens = new vscode.CodeLens(codeLensRange)
    const shortcut = isRunningInsideAgent() ? '' : ` (${process.platform === 'darwin' ? '⌥A' : 'Alt+A'})`
    lens.command = {
        title: `$(cody-logo) Accept All${shortcut}`,
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

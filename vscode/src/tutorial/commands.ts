import { ps, telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { executeEdit } from '../edit/execute'
import { TERMINAL_EDIT_STATES } from '../non-stop/codelenses/constants'
import { type TextChange, updateRangeMultipleChanges } from '../non-stop/tracked-range'
import { TODO_DECORATION } from './constants'
import type { TutorialStep } from './content'

export const setFixDiagnostic = (
    collection: vscode.DiagnosticCollection,
    uri: vscode.Uri,
    range: vscode.Range
) => {
    if (!collection || collection.has(uri)) {
        return
    }

    // Attach diagnostics to the fix line. This is so that, if the user doesn't already have
    // a Python language server installed, they will still see the "Ask Cody to Fix" option.
    collection.set(uri, [
        {
            range,
            message: 'Python: Implicit string concatenation not allowed',
            severity: vscode.DiagnosticSeverity.Error,
        },
    ])
}

export type TutorialSource = 'link' | 'editor'

export const registerEditTutorialCommand = (
    editor: vscode.TextEditor,
    onComplete: () => void,
    range: vscode.Range
): vscode.Disposable[] => {
    let trackedRange = range
    const rangeTracker = vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document !== editor.document) {
            return
        }

        const changes = new Array<TextChange>(...event.contentChanges)
        const updatedRange = updateRangeMultipleChanges(trackedRange, changes)
        if (!updatedRange.isEqual(trackedRange)) {
            trackedRange = updatedRange
        }
    })

    const editCommand = vscode.commands.registerCommand(
        'cody.tutorial.edit',
        async (_document: vscode.TextDocument, source: TutorialSource = 'editor') => {
            telemetryRecorder.recordEvent('cody.interactiveTutorial', 'edit', {
                privateMetadata: { source },
            })

            // Clear the existing decoration, the user has actioned this step,
            // we're just waiting for the response.
            editor.setDecorations(TODO_DECORATION, [])

            const task = await executeEdit({
                configuration: {
                    document: editor.document,
                    range: trackedRange,
                    preInstruction: ps`Function that finds logs in a dir`,
                },
            })

            if (!task) {
                return
            }

            // Poll for task.state being applied
            const interval = setInterval(async () => {
                if (TERMINAL_EDIT_STATES.includes(task.state)) {
                    clearInterval(interval)
                    onComplete()
                }
            }, 100)
        }
    )

    return [rangeTracker, editCommand]
}

export const registerChatTutorialCommand = (onComplete: () => void): vscode.Disposable => {
    const disposable = vscode.commands.registerCommand(
        'cody.tutorial.chat',
        async (_document: vscode.TextDocument, source: TutorialSource = 'editor') => {
            telemetryRecorder.recordEvent('cody.interactiveTutorial', 'chat', {
                privateMetadata: { source },
            })
            await vscode.commands.executeCommand('cody.chat.newEditorPanel')
            onComplete()
        }
    )
    return disposable
}

/**
 * Listen for cursor updates in the tutorial text document,
 * so we can automatically trigger a completion when the user
 * clicks on the intended line.
 * This is intended as a shortcut to typical completions without
 * requiring the user to actually start typing.
 */
export const registerAutocompleteListener = (
    editor: vscode.TextEditor,
    activeStep: TutorialStep
): vscode.Disposable => {
    const disposable = vscode.window.onDidChangeTextEditorSelection(async ({ textEditor }) => {
        const document = textEditor.document
        if (document.uri !== editor.document.uri) {
            return
        }

        if (!textEditor.selection.isEmpty) {
            return
        }

        if (!activeStep || activeStep.type !== 'onTextChange') {
            // todo should nebver happe
            return
        }

        if (
            activeStep.range.contains(textEditor.selection.active) &&
            document.getText(activeStep.range).trim() === activeStep.originalText
        ) {
            // Cursor is on the intended autocomplete line, and we don't already have any content
            // Manually trigger an autocomplete for the ease of the tutorial
            await vscode.commands.executeCommand('cody.autocomplete.manual-trigger')
        }
    })
    return disposable
}

import { PromptString } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { executeEdit } from '../edit/execute'
import { CodyTaskState } from '../non-stop/utils'
import { TODO_DECORATION } from './constants'
import {
    type TutorialStep,
    type TutorialStepKey,
    getNextStep,
    getStepContent,
    getStepData,
} from './content'
import { setTutorialUri } from './helpers'
import { CodyChatLinkProvider } from './utils'

const openTutorialDocument = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
    await vscode.workspace.fs.writeFile(uri, new Uint8Array())
    return vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside })
}

export const startTutorial = async (documentUri: vscode.Uri): Promise<vscode.Disposable[]> => {
    const disposables: vscode.Disposable[] = []
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codyTutorial')
    disposables.push(diagnosticCollection)

    const editor = await openTutorialDocument(documentUri)
    let activeStep: TutorialStep | undefined

    /**
     * Listen for changes in the tutorial text document, and update the
     * active line ranges depending on those changes.
     * This ensures that, even if the user modifies the document,
     * we can accurately track where we want them to interact.
     */
    let activeRangeListener: vscode.Disposable | undefined
    const setActiveRangeListener = (range: vscode.Range) => {
        activeRangeListener?.dispose()
        activeRangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri !== editor.document.uri) {
                return
            }
            if (!activeStep) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)

            const newInteractiveRange = updateRangeMultipleChanges(range, changes, {
                supportRangeAffix: true,
            })
            if (!newInteractiveRange.isEqual(range)) {
                activeStep.range = newInteractiveRange
            }
        })
        return activeRangeListener
    }

    const setDiagnostic = (range: vscode.Range) => {
        if (!diagnosticCollection || diagnosticCollection.has(documentUri)) {
            return
        }

        // Attach diagnostics to the fix line. This is so that, if the user doesn't already have
        // a Python language server installed, they will still see the "Ask Cody to Fix" option.
        diagnosticCollection.set(documentUri, [
            {
                range,
                message: 'Implicit string concatenation not allowed',
                severity: vscode.DiagnosticSeverity.Error,
            },
        ])
    }

    /**
     * Listen for cursor updates in the tutorial text document,
     * so we can automatically trigger a completion when the user
     * clicks on the intended line.
     * This is intended as a shortcut to typical completions without
     * requiring the user to actually start typing.
     */
    let autocompleteListener: vscode.Disposable | undefined
    const registerAutocompleteListener = () => {
        autocompleteListener = vscode.window.onDidChangeTextEditorSelection(async ({ textEditor }) => {
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
        return autocompleteListener
    }

    const progressToNextStep = async () => {
        const nextStep = activeStep?.key ? getNextStep(activeStep.key) : 'autocomplete'

        if (nextStep === null) {
            editor.setDecorations(TODO_DECORATION, [])
            await editor.document.save()
            // TODO: Should we do this, is it worth it?
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor', documentUri)
            return
        }

        // Side effects triggered by leaving the active state
        switch (activeStep?.key) {
            case 'autocomplete':
                autocompleteListener?.dispose()
                break
            case 'fix':
                diagnosticCollection?.clear()
                break
            case 'edit':
                editTutorialCommand?.dispose()
                break
            case 'chat':
                chatTutorialCommand?.dispose()
                break
        }
        // Clear any existing range listener
        activeRangeListener?.dispose()
        editor.setDecorations(TODO_DECORATION, [])

        const content = getStepContent(nextStep)

        // Add to the bottom of the document with the new step content
        await editor.edit(editBuilder => {
            editBuilder.insert(new vscode.Position(editor.document.lineCount, 0), content)
        })
        disposables.push(startListeningForSuccess(nextStep))

        activeStep = getStepData(editor.document, nextStep)
        disposables.push(setActiveRangeListener(activeStep.range))
        editor.setDecorations(TODO_DECORATION, [
            new vscode.Range(activeStep.range.start.line, 0, activeStep.range.start.line, 0),
        ])

        // Side effects triggered by entering the new state
        switch (nextStep) {
            case 'autocomplete':
                disposables.push(registerAutocompleteListener())
                break
            case 'fix':
                setDiagnostic(activeStep.range)
                break
            case 'edit':
                disposables.push(registerEditTutorialCommand())
                break
            case 'chat':
                disposables.push(registerChatTutorialCommand())
                break
        }
    }

    let editTutorialCommand: vscode.Disposable | undefined
    const registerEditTutorialCommand = () => {
        editTutorialCommand?.dispose()
        editTutorialCommand = vscode.commands.registerCommand('cody.tutorial.edit', async document => {
            const task = await executeEdit({
                configuration: {
                    document: editor.document,
                    preInstruction: PromptString.unsafe_fromUserQuery(
                        'Function that finds logs in a dir'
                    ),
                },
            })

            if (!task) {
                return
            }

            // Clear the existing decoration, the user has actioned it,
            // we're just waiting for the full response.
            editor.setDecorations(TODO_DECORATION, [])

            // Poll for task.state being applied
            const interval = setInterval(async () => {
                if (task.state === CodyTaskState.applied) {
                    clearInterval(interval)
                    progressToNextStep()
                }
            }, 100)
        })
        return editTutorialCommand
    }

    let chatTutorialCommand: vscode.Disposable | undefined
    const registerChatTutorialCommand = () => {
        chatTutorialCommand?.dispose()
        chatTutorialCommand = vscode.commands.registerCommand('cody.tutorial.chat', () => {
            progressToNextStep()
            return vscode.commands.executeCommand('cody.chat.panel.new')
        })
        return chatTutorialCommand
    }

    /**
     * Listen to __any__ changes in the interactive text document, so we can
     * check to see if the user has made any progress on the tutorial tasks.
     *
     * If the user has modified any of the interactive lines, then we mark
     * that line as complete.
     */
    let successListener: vscode.Disposable | undefined
    const startListeningForSuccess = (key: TutorialStepKey) => {
        // Dispose of any existing listener
        successListener?.dispose()
        successListener = vscode.workspace.onDidChangeTextDocument(async ({ document }) => {
            if (document.uri !== editor.document.uri) {
                return
            }
            if (activeStep?.key !== key || activeStep.type !== 'onTextChange') {
                return
            }

            const activeText = editor.document.getText(activeStep.range).trim()
            if (activeText.length > 0 && activeText !== activeStep.originalText) {
                if (key === 'fix') {
                    // Additionally reset the diagnostics
                    diagnosticCollection?.clear()
                }
                if (key === 'autocomplete' || key === 'fix') {
                    successListener?.dispose()
                    progressToNextStep()
                }
            }
        })
        return successListener
    }

    progressToNextStep()

    disposables.push(
        startListeningForSuccess('autocomplete'),
        vscode.languages.registerDocumentLinkProvider(
            editor.document.uri,
            new CodyChatLinkProvider(editor)
        ),
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            const tutorialIsActive = editors.find(
                editor => editor.document.uri.toString() === documentUri.toString()
            )
            if (!tutorialIsActive || !activeStep?.range) {
                return
            }
            // Decorations are cleared when an editor is no longer visible, we need to ensure we always set
            // them when the tutorial becomes visible
            editor.setDecorations(TODO_DECORATION, [activeStep.range])
        })
    )

    return disposables
}

export const registerInteractiveTutorial = async (
    context: vscode.ExtensionContext
): Promise<{
    disposables: vscode.Disposable[]
    start: () => Promise<void>
}> => {
    const disposables: vscode.Disposable[] = []
    let activeDisposables: vscode.Disposable[] = []
    const documentUri = setTutorialUri(context)
    let hasStarted = false

    const start = async () => {
        stop()
        hasStarted = true
        activeDisposables.push(...(await startTutorial(documentUri)))
    }

    const stop = async () => {
        hasStarted = false
        for (const disposable of activeDisposables) {
            disposable.dispose()
            activeDisposables = []
        }
    }

    disposables.push(
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            const tutorialIsVisible = editors.find(
                editor => editor.document.uri.toString() === documentUri.toString()
            )
            if (!tutorialIsVisible && hasStarted) {
                return stop()
            }
            if (tutorialIsVisible && !hasStarted) {
                return start()
            }
            return
        }),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            const tutorialIsActive = editor && editor.document.uri.toString() === documentUri.toString()
            return vscode.commands.executeCommand('setContext', 'cody.tutorialActive', tutorialIsActive)
        }),
        vscode.commands.registerCommand('cody.tutorial.start', () => {
            if (hasStarted) {
                return vscode.window.showTextDocument(documentUri)
            }

            return start()
        })
    )

    const tutorialVisible = vscode.window.visibleTextEditors.some(
        editor => editor.document.uri.toString() === documentUri.toString()
    )
    if (!hasStarted && tutorialVisible) {
        start()
    }

    return {
        disposables,
        start,
    }
}

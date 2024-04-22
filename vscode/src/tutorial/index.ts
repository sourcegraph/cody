import * as fs from 'node:fs/promises'
import { PromptString } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { executeEdit } from '../edit/execute'
import { TODO_DECORATION } from './constants'
import { type TutorialStepType, getNextStep, getStepContent, getStepRange } from './content'
import { setTutorialUri } from './helpers'
import { CodyChatLinkProvider } from './utils'
import { CodyTaskState } from '../non-stop/utils'

const openTutorialDocument = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
    if (process.platform === 'darwin') {
        await fs.writeFile(uri.fsPath, '')
    } else {
        await fs.writeFile(uri.fsPath, '')
    }
    return vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside })
}

export const startTutorial = async (documentUri: vscode.Uri): Promise<vscode.Disposable[]> => {
    const disposables: vscode.Disposable[] = []
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codyTutorial')
    disposables.push(diagnosticCollection)

    const editor = await openTutorialDocument(documentUri)

    let originalRangeText: string | undefined
    let activeRange: vscode.Range | undefined
    let activeRangeListener: vscode.Disposable | undefined

    /**
     * Listen for changes in the tutorial text document, and update the
     * active line ranges depending on those changes.
     * This ensures that, even if the user modifies the document,
     * we can accurately track where we want them to interact.
     */
    const setActiveRangeListener = (range: vscode.Range) => {
        activeRangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri !== editor.document.uri) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)

            const newInteractiveRange = updateRangeMultipleChanges(range, changes, {
                supportRangeAffix: true,
            })
            if (!newInteractiveRange.isEqual(range)) {
                activeRange = newInteractiveRange
            }
        })
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

            if (!activeRange) {
                // TODO: Should never happen...
                return
            }

            if (
                activeRange.contains(textEditor.selection.active) &&
                document.getText(activeRange).trim() === originalRangeText
            ) {
                // Cursor is on the intended autocomplete line, and we don't already have any content
                // Manually trigger an autocomplete for the ease of the tutorial
                await vscode.commands.executeCommand('cody.autocomplete.manual-trigger')
                autocompleteListener?.dispose()
            }
        })
    }

    let activeStep: TutorialStepType
    const progressToNextStep = async () => {
        const nextStep = activeStep ? getNextStep(activeStep) : 'autocomplete'

        if (nextStep === null) {
            // Clear any decorations on complete
            editor.setDecorations(TODO_DECORATION, [])
            // Close the window
            return
        }

        const currentStep = activeStep
        // Side effects triggered by leaving the active state
        switch (currentStep) {
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

        activeStep = nextStep
        const content = getStepContent(nextStep)

        // Add to the bottom of the document with the new step content
        const edit = new vscode.WorkspaceEdit()
        edit.insert(documentUri, new vscode.Position(editor.document.lineCount, 0), content)
        await vscode.workspace.applyEdit(edit)
        startListeningForSuccess(nextStep)

        const stepRange = getStepRange(editor.document, nextStep)
        originalRangeText = stepRange?.originalText
        activeRange = stepRange?.range
        if (stepRange) {
            setActiveRangeListener(stepRange.range)
            editor.setDecorations(TODO_DECORATION, [stepRange.range])
        }

        // Side effects triggered by entering the new state
        switch (nextStep) {
            case 'autocomplete':
                registerAutocompleteListener()
                break
            case 'fix':
                if (stepRange?.range) {
                    setDiagnostic(stepRange.range)
                }
                break
            case 'edit':
                registerEditTutorialCommand()
                break
            case 'chat':
                registerChatTutorialCommand()
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
                // TODO: What to do?
                return
            }

            // Poll for task.state being applied
            const interval = setInterval(async () => {
                if (task.state === CodyTaskState.applied) {
                    clearInterval(interval)
                    progressToNextStep()
                }
            }, 100)
        })
    }

    let chatTutorialCommand: vscode.Disposable | undefined
    const registerChatTutorialCommand = () => {
        chatTutorialCommand?.dispose()
        chatTutorialCommand = vscode.commands.registerCommand('cody.tutorial.chat', () => {
            progressToNextStep()
            return vscode.commands.executeCommand('cody.chat.panel.new')
        })
    }

    disposables.push(
        vscode.languages.registerDocumentLinkProvider(
            editor.document.uri,
            new CodyChatLinkProvider(editor)
        )
    )

    /**
     * Listen to __any__ changes in the interactive text document, so we can
     * check to see if the user has made any progress on the tutorial tasks.
     *
     * If the user has modified any of the interactive lines, then we mark
     * that line as complete.
     */
    let successListener: vscode.Disposable | undefined
    const startListeningForSuccess = (step: TutorialStepType) => {
        // Dispose of any existing listener
        successListener?.dispose()

        successListener = vscode.workspace.onDidChangeTextDocument(async ({ document }) => {
            if (document.uri !== editor.document.uri) {
                return
            }
            if (activeStep !== step || !activeRange || originalRangeText === undefined) {
                return
            }

            const activeText = editor.document.getText(activeRange).trim()
            if (activeText.length > 0 && activeText !== originalRangeText) {
                if (activeStep === 'fix') {
                    // Additionally reset the diagnostics
                    diagnosticCollection?.clear()
                }
                progressToNextStep()
            }
        })
    }

    progressToNextStep()
    startListeningForSuccess('autocomplete')

    disposables.push(
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            const tutorialIsActive = editors.find(
                editor => editor.document.uri.toString() === documentUri.toString()
            )
            if (!tutorialIsActive || !activeRange) {
                return
            }
            // Decorations are cleared when an editor is no longer visible, we need to ensure we always set
            // them when the tutorial becomes visible
            editor.setDecorations(TODO_DECORATION, [activeRange])
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

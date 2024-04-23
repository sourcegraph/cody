import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { TODO_DECORATION } from './constants'
import {
    type TutorialStepKey,
    getNextStep,
    getStepContent,
    getStepData,
    type TutorialStep,
} from './content'
import { setTutorialUri } from './helpers'
import { CodyChatLinkProvider } from './utils'
import {
    registerAutocompleteListener,
    registerChatTutorialCommand,
    registerEditTutorialCommand,
    setFixDiagnostic,
} from './commands'

// const openTutorialDocument = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
//     const firstStep = getStepContent('autocomplete')
//     await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(firstStep))
//     // await vscode.workspace.fs.writeFile(uri, new Uint8Array())
//     const document = await vscode.workspace.openTextDocument(uri)
//     return vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside })
// }

export const startTutorial = async (document: vscode.TextDocument): Promise<() => void> => {
    const disposables: vscode.Disposable[] = []
    const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
    })
    let activeStep: TutorialStep | null = null

    let editTutorialCommand: vscode.Disposable | undefined
    let chatTutorialCommand: vscode.Disposable | undefined
    let autocompleteListener: vscode.Disposable | undefined
    let activeRangeListener: vscode.Disposable | undefined

    /**
     * Listen for changes in the tutorial text document, and update the
     * active line ranges depending on those changes.
     * This ensures that, even if the user modifies the document,
     * we can accurately track where we want them to interact.
     */
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

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codyTutorial')
    disposables.push(diagnosticCollection)

    const progressToNextStep = async () => {
        const nextStep = activeStep?.key ? getNextStep(activeStep.key) : 'autocomplete'

        if (nextStep === null) {
            editor.setDecorations(TODO_DECORATION, [])
            await editor.document.save()
            // TODO: Should we do this, is it worth it?
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor', document.uri)
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

        // We already have the autocomplete text from init
        const needsInsertion = nextStep !== 'autocomplete'
        if (needsInsertion) {
            const content = getStepContent(nextStep)
            // Add to the bottom of the document with the new step content
            await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(editor.document.lineCount, 0), content)
            })
        }

        disposables.push(startListeningForSuccess(nextStep))

        activeStep = getStepData(editor.document, nextStep)
        if (!activeStep) {
            console.log('DIDNT FIND THE ACTIVE STEP')
            return
        }

        disposables.push(setActiveRangeListener(activeStep.range))
        editor.setDecorations(TODO_DECORATION, [
            new vscode.Range(activeStep.range.start.line, 0, activeStep.range.start.line, 0),
        ])

        // Side effects triggered by entering the new state
        switch (nextStep) {
            case 'autocomplete':
                disposables.push(registerAutocompleteListener(editor, activeStep))
                break
            case 'fix':
                setFixDiagnostic(diagnosticCollection, editor.document.uri, activeStep.range)
                break
            case 'edit':
                disposables.push(registerEditTutorialCommand(editor, progressToNextStep))
                break
            case 'chat':
                disposables.push(registerChatTutorialCommand(progressToNextStep))
                break
        }
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
                    diagnosticCollection.clear()
                }
                successListener?.dispose()
                progressToNextStep()
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
                editor => editor.document.uri.toString() === document.uri.toString()
            )
            if (!tutorialIsActive || !activeStep?.range) {
                return
            }
            // Decorations are cleared when an editor is no longer visible, we need to ensure we always set
            // them when the tutorial becomes visible
            editor.setDecorations(TODO_DECORATION, [activeStep.range])
        })
    )

    return () => {
        for (const disposable of disposables) {
            disposable.dispose()
        }
    }
}

export const registerInteractiveTutorial = async (
    context: vscode.ExtensionContext
): Promise<{
    disposables: vscode.Disposable[]
    start: () => Promise<void>
}> => {
    const disposables: vscode.Disposable[] = []
    const documentUri = setTutorialUri(context)
    let hasStarted = false
    let cleanup: (() => void) | undefined

    const firstStep = getStepContent('autocomplete')
    await vscode.workspace.fs.writeFile(documentUri, new TextEncoder().encode(firstStep))
    // await vscode.workspace.fs.writeFile(uri, new Uint8Array())
    const document = await vscode.workspace.openTextDocument(documentUri)
    console.log(document)

    const start = async () => {
        stop()
        hasStarted = true
        cleanup = await startTutorial(document)
    }

    const stop = async () => {
        hasStarted = false
        cleanup?.()
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

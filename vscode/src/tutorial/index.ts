import { telemetryRecorder } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { logSidebarClick } from '../services/SidebarCommands'
import {
    registerAutocompleteListener,
    registerChatTutorialCommand,
    registerEditTutorialCommand,
    setFixDiagnostic,
} from './commands'
import { TODO_DECORATION } from './constants'
import {
    type TutorialStep,
    type TutorialStepKey,
    getNextStep,
    getStepContent,
    getStepData,
    initTutorialDocument,
    resetDocument,
} from './content'
import { setTutorialUri } from './helpers'
import { ResetLensProvider, TutorialLinkProvider } from './providers'

const startTutorial = async (document: vscode.TextDocument): Promise<vscode.Disposable> => {
    const disposables: vscode.Disposable[] = []
    const editor = await vscode.window.showTextDocument(document)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codyTutorial')
    disposables.push(diagnosticCollection)
    telemetryRecorder.recordEvent('cody.interactiveTutorial', 'started')

    let activeStep: TutorialStep | null = null

    // We set these disposables dynamically, based on the active step
    let editTutorialCommand: vscode.Disposable | undefined
    let chatTutorialCommand: vscode.Disposable | undefined
    let autocompleteListener: vscode.Disposable | undefined
    let activeRangeListener: vscode.Disposable | undefined
    let successListener: vscode.Disposable | undefined

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

            const newInteractiveRange = updateRangeMultipleChanges(range, changes)
            if (!newInteractiveRange.isEqual(range)) {
                activeStep.range = newInteractiveRange
            }
        })
        return activeRangeListener
    }

    const progressToNextStep = async () => {
        const nextStep = activeStep?.key ? getNextStep(activeStep.key) : 'autocomplete'

        if (activeStep?.key) {
            telemetryRecorder.recordEvent('cody.interactiveTutorial.stepComplete', activeStep.key)
        }

        if (nextStep === null) {
            editor.setDecorations(TODO_DECORATION, [])
            telemetryRecorder.recordEvent('cody.interactiveTutorial', 'finished')
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

        // Save the document once we've finished modifying the document
        // This ensures the user doesn't get prompted to save it themselves on close
        editor.document.save()

        activeStep = getStepData(editor.document, nextStep)
        if (!activeStep) {
            return
        }
        disposables.push(startListeningForSuccess(nextStep), setActiveRangeListener(activeStep.range))
        editor.setDecorations(TODO_DECORATION, [activeStep.range])

        // Side effects triggered by entering the new state
        switch (nextStep) {
            case 'autocomplete':
                disposables.push(registerAutocompleteListener(editor, activeStep))
                break
            case 'fix':
                setFixDiagnostic(diagnosticCollection, editor.document.uri, activeStep.range)
                break
            case 'edit':
                disposables.push(
                    ...registerEditTutorialCommand(editor, progressToNextStep, activeStep.range)
                )
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
        new ResetLensProvider(editor),
        vscode.languages.registerDocumentLinkProvider(
            editor.document.uri,
            new TutorialLinkProvider(editor)
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

    return new vscode.Disposable(() => {
        for (const disposable of disposables) {
            disposable.dispose()
        }
        return initTutorialDocument(document.uri)
    })
}

export const registerInteractiveTutorial = async (
    context: vscode.ExtensionContext
): Promise<vscode.Disposable[]> => {
    const disposables: vscode.Disposable[] = []
    const documentUri = setTutorialUri(context)
    let document = await initTutorialDocument(documentUri)

    let status: 'stopped' | 'started' | 'starting' = 'stopped'

    let cleanup: vscode.Disposable | undefined
    const start = async () => {
        status = 'starting'
        cleanup = await startTutorial(document)
        disposables.push(cleanup)
        status = 'started'
    }
    const stop = async () => {
        cleanup?.dispose()
        status = 'stopped'
    }

    disposables.push(
        vscode.window.onDidChangeVisibleTextEditors(editors => {
            const tutorialIsVisible = editors.find(
                editor => editor.document.uri.toString() === documentUri.toString()
            )

            if (status === 'starting') {
                // Do not re-fire start/stop events whilst the tutorial is starting
                return
            }

            if (status === 'started' && !tutorialIsVisible) {
                return stop()
            }
            if (status === 'stopped' && tutorialIsVisible) {
                return start()
            }
            return
        }),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            const tutorialIsActive = editor && editor.document.uri.toString() === documentUri.toString()
            return vscode.commands.executeCommand('setContext', 'cody.tutorialActive', tutorialIsActive)
        }),
        vscode.workspace.onDidCloseTextDocument(document => {
            if (document.uri !== documentUri) {
                return
            }
            telemetryRecorder.recordEvent('cody.interactiveTutorial', 'closed')
        }),
        vscode.commands.registerCommand('cody.tutorial.start', async () => {
            if (status === 'started') {
                return vscode.window.showTextDocument(documentUri)
            }
            return start()
        }),
        vscode.commands.registerCommand('cody.tutorial.reset', async () => {
            telemetryRecorder.recordEvent('cody.interactiveTutorial', 'reset')
            stop()
            document = await resetDocument(documentUri)
            return start()
        }),
        vscode.commands.registerCommand('cody.sidebar.tutorial', () => {
            logSidebarClick('tutorial')
            void vscode.commands.executeCommand('cody.tutorial.start')
        })
    )

    const tutorialVisible = vscode.window.visibleTextEditors.some(
        editor => editor.document.uri.toString() === documentUri.toString()
    )
    if (tutorialVisible) {
        await start()
    }

    return disposables
}

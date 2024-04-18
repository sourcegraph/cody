import * as fs from 'node:fs/promises'
import { PromptString } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { executeEdit } from '../edit/execute'
import { COMPLETE_DECORATION, INTRO_DECORATION, TODO_DECORATION } from './constants'
import { TUTORIAL_CONTENT, TUTORIAL_MACOS_CONTENT, getInteractiveRanges } from './content'
import { setTutorialUri } from './helpers'
import { CodyChatLinkProvider, findRangeOfText } from './utils'
;('./utils')

const openTutorial = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
    if (process.platform === 'darwin') {
        await fs.writeFile(uri.fsPath, TUTORIAL_MACOS_CONTENT)
    } else {
        await fs.writeFile(uri.fsPath, TUTORIAL_CONTENT)
    }
    return vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside })
}

export const registerInteractiveTutorial = async (
    context: vscode.ExtensionContext
): Promise<{
    disposables: vscode.Disposable[]
    start: () => Promise<void>
}> => {
    const disposables: vscode.Disposable[] = []
    const activeDisposables: vscode.Disposable[] = []
    const documentUri = setTutorialUri(context)
    let diagnosticCollection: vscode.DiagnosticCollection | undefined
    let hasStarted = false

    const start = async () => {
        if (hasStarted) {
            stop()
        }
        hasStarted = true
        const editor = await openTutorial(documentUri)
        let chatComplete = false
        const introductionRange = findRangeOfText(editor.document, 'Welcome to Cody!')
        let chatRange = findRangeOfText(editor.document, 'Start a Chat')
        const interactiveRanges = getInteractiveRanges(editor.document)

        // Set gutter decorations for associated lines, note: VS Code automatically keeps track of
        // these lines so we don't need to update these
        editor.setDecorations(INTRO_DECORATION, introductionRange ? [introductionRange] : [])

        disposables.push(
            vscode.languages.registerDocumentLinkProvider(
                editor.document.uri,
                new CodyChatLinkProvider(editor)
            )
        )

        diagnosticCollection = vscode.languages.createDiagnosticCollection('codyTutorial')
        const setDiagnostic = () => {
            if (!diagnosticCollection || diagnosticCollection.has(documentUri)) {
                return
            }

            // Attach diagnostics to the fix line. This is so that, if the user doesn't already have
            // a Python language server installed, they will still see the "Ask Cody to Fix" option.
            diagnosticCollection.set(documentUri, [
                {
                    range: interactiveRanges.Fix.range,
                    message: 'Implicit string concatenation not allowed',
                    severity: vscode.DiagnosticSeverity.Error,
                },
            ])
        }
        setDiagnostic()

        const setCompletedStates = (editor: vscode.TextEditor) => {
            // We don't actually care about the changes here, we just want to inspect our tracked
            // lines to see if they are still empty. If they are not, they we can report success
            const completeDecorations: vscode.DecorationOptions[] = []
            const todoDecorations: vscode.DecorationOptions[] = []

            for (const [key, interactiveRange] of Object.entries(interactiveRanges)) {
                const activeText = editor.document.getText(interactiveRange.range).trim()
                if (activeText.length > 0 && activeText !== interactiveRange.originalText) {
                    completeDecorations.push({
                        range: new vscode.Range(
                            interactiveRange.range.start,
                            interactiveRange.range.start
                        ),
                    })

                    if (key === 'Fix') {
                        // Additionally reset the diagnostics
                        diagnosticCollection?.clear()
                    }
                } else {
                    todoDecorations.push({
                        range: new vscode.Range(
                            interactiveRange.range.start,
                            interactiveRange.range.start
                        ),
                    })

                    if (key === 'Fix') {
                        // Re-apply the diagnostic
                        setDiagnostic()
                    }
                }
            }

            if (chatComplete && chatRange) {
                completeDecorations.push({ range: chatRange })
            } else if (chatRange) {
                todoDecorations.push({ range: chatRange })
            }

            editor.setDecorations(TODO_DECORATION, todoDecorations)
            editor.setDecorations(COMPLETE_DECORATION, completeDecorations)
        }
        setCompletedStates(editor)

        /**
         * Listen for changes in the tutorial text document, and update the
         * interactive line ranges depending on those changes.
         * This ensures that, even if the user modifies the document,
         * we can accurately track where we want them to interact.
         */
        const listenForInteractiveLineRangeUpdates = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri !== editor.document.uri) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)

            if (chatRange) {
                const newChatRange = updateRangeMultipleChanges(chatRange, changes, {
                    supportRangeAffix: true,
                })
                if (!newChatRange.isEqual(chatRange)) {
                    chatRange = newChatRange
                }
            }

            for (const [key, interactiveRange] of Object.entries(interactiveRanges)) {
                const newInteractiveRange = updateRangeMultipleChanges(interactiveRange.range, changes, {
                    supportRangeAffix: true,
                })
                if (!newInteractiveRange.isEqual(interactiveRange.range)) {
                    interactiveRange.range = newInteractiveRange

                    if (key === 'Fix') {
                        // We need to update the diagnostic onto the new range
                        diagnosticCollection?.clear()
                        setDiagnostic()
                    }
                }
            }
        })

        /**
         * Listen for cursor updates in the tutorial text document,
         * so we can automatically trigger a completion when the user
         * clicks on the intended line.
         * This is intended as a shortcut to typical completions without
         * requiring the user to actually start typing.
         */
        const listenForAutocomplete = vscode.window.onDidChangeTextEditorSelection(
            async ({ textEditor }) => {
                const document = textEditor.document
                if (document.uri !== editor.document.uri) {
                    return
                }

                if (!textEditor.selection.isEmpty) {
                    return
                }

                const interactiveRange = interactiveRanges.Autocomplete
                if (
                    interactiveRange.range.contains(textEditor.selection.active) &&
                    document.getText(interactiveRange.range).trim() === interactiveRange.originalText
                ) {
                    // Cursor is on the intended autocomplete line, and we don't already have any content
                    // Manually trigger an autocomplete for the ease of the tutorial
                    await vscode.commands.executeCommand('cody.autocomplete.manual-trigger')
                }
            }
        )

        /**
         * Listen to __any__ changes in the interactive text document, so we can
         * check to see if the user has made any progress on the tutorial tasks.
         *
         * If the user has modified any of the interactive lines, then we mark
         * that line as complete.
         */
        const listenForSuccess = vscode.workspace.onDidChangeTextDocument(async ({ document }) => {
            if (document.uri !== editor.document.uri) {
                return
            }

            return setCompletedStates(editor)
        })

        disposables.push(
            vscode.commands.registerCommand('cody.tutorial.chat', () => {
                chatComplete = true
                setCompletedStates(editor)
                return vscode.commands.executeCommand('cody.chat.panel.new')
            }),
            vscode.commands.registerCommand('cody.tutorial.edit', document => {
                return executeEdit({
                    configuration: {
                        document: editor.document,
                        preInstruction: PromptString.unsafe_fromUserQuery(
                            'Function that finds logs in a dir'
                        ),
                    },
                })
            }),
            listenForInteractiveLineRangeUpdates,
            listenForAutocomplete,
            listenForSuccess,
            vscode.window.onDidChangeVisibleTextEditors(editors => {
                const tutorialIsActive = editors.find(
                    editor => editor.document.uri.toString() === documentUri.toString()
                )
                if (!tutorialIsActive) {
                    return
                }
                // TODO: This is kinda weird, the editor will change when visible editors changes
                // We need to always update `editor` to match this value, otherwise our logic might get
                // out of date.
                // We should try to create the document on register, and then always get a fresh editor
                // when it becomes visible. This will mean calling start() on visible and stop() when hidden.
                console.log('Setting compelted states...')
                // Decorations are cleared when an editor is no longer visible, we need to ensure we always set
                // them when the tutorial becomes visible
                return setCompletedStates(tutorialIsActive)
            })
        )
    }

    const stop = async () => {
        await vscode.commands.executeCommand('setContext', 'cody.tutorialActive', false)
        diagnosticCollection?.clear()
        for (const disposable of activeDisposables) {
            disposable.dispose()
        }
    }

    disposables.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            if (document.uri.toString() !== documentUri.toString()) {
                return
            }
            // Tutorial has been closed, let's clean up
            stop()
        }),
        vscode.workspace.onDidOpenTextDocument(document => {
            if (document.uri.toString() !== documentUri.toString() || hasStarted) {
                return
            }
            // Tutorial has been opened, let's start!
            start()
        }),
        vscode.window.onDidChangeActiveTextEditor(async editor => {
            const tutorialIsActive = editor && editor.document.uri.toString() === documentUri.toString()
            return vscode.commands.executeCommand('setContext', 'cody.tutorialActive', tutorialIsActive)
        }),
        vscode.commands.registerCommand('cody.tutorial.start', start)
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

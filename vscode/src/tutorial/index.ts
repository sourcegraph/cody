import * as fs from 'node:fs/promises'
import path from 'node:path'
import * as vscode from 'vscode'
import { type TextChange, updateRangeMultipleChanges } from '../../src/non-stop/tracked-range'
import { executeEdit } from '../edit/execute'
import { COMPLETE_DECORATION, INTRO_DECORATION, TODO_DECORATION } from './constants'
import { TUTORIAL_CONTENT, TUTORIAL_MACOS_CONTENT, getInteractiveRanges } from './content'
import { CodyChatLinkProvider, findRangeOfText } from './utils'

const openTutorial = async (uri: vscode.Uri): Promise<vscode.TextEditor> => {
    if (process.platform === 'darwin') {
        await fs.writeFile(uri.fsPath, TUTORIAL_MACOS_CONTENT)
    } else {
        await fs.writeFile(uri.fsPath, TUTORIAL_CONTENT)
    }
    return vscode.window.showTextDocument(uri)
}

export const registerInteractiveTutorial = async (
    context: vscode.ExtensionContext
): Promise<{
    disposables: vscode.Disposable[]
    start: () => Promise<void>
}> => {
    const disposables: vscode.Disposable[] = []
    const activeDisposables: vscode.Disposable[] = []
    const tutorialPath = path.join(context.extensionUri.fsPath, 'walkthroughs', 'cody_tutorial.py')
    const documentUri = vscode.Uri.file(tutorialPath)
    let diagnosticCollection: vscode.DiagnosticCollection | undefined

    const start = async () => {
        await vscode.commands.executeCommand('setContext', 'cody.tutorialActive', true)
        const editor = await openTutorial(documentUri)
        let chatComplete = false
        const introductionRange = findRangeOfText(editor.document, 'Welcome to Cody!')
        let chatRange = findRangeOfText(editor.document, 'Start a Chat')
        const interactiveRanges = getInteractiveRanges(editor.document)

        // Set gutter decorations for associated lines, note: VS Code automatically keeps track of these lines
        // so we don't need to update these
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
            diagnosticCollection?.set(documentUri, [
                {
                    range: interactiveRanges.Fix.range,
                    message: 'Implicit string concatenation not allowed',
                    severity: vscode.DiagnosticSeverity.Error,
                },
            ])
        }
        setDiagnostic()

        const setCompletedStates = () => {
            // We don't actually care about the changes here, we just want to inspect our tracked
            // lines to see if they are still empty. If they are not, they we can report success
            const completeRanges = []
            const todoRanges = []

            for (const [key, interactiveRange] of Object.entries(interactiveRanges)) {
                const activeText = editor.document.getText(interactiveRange.range).trim()
                if (activeText.length > 0 && activeText !== interactiveRange.originalText) {
                    completeRanges.push(
                        new vscode.Range(interactiveRange.range.start, interactiveRange.range.start)
                    )

                    if (key === 'Fix') {
                        // Additionally reset the diagnostics
                        diagnosticCollection?.clear()
                    }
                } else {
                    todoRanges.push(
                        new vscode.Range(interactiveRange.range.start, interactiveRange.range.start)
                    )

                    if (key === 'Fix') {
                        // Re-apply the diagnostic
                        setDiagnostic()
                    }
                }
            }

            if (chatComplete && chatRange) {
                completeRanges.push(chatRange)
            } else if (chatRange) {
                todoRanges.push(chatRange)
            }

            editor.setDecorations(TODO_DECORATION, todoRanges)
            editor.setDecorations(COMPLETE_DECORATION, completeRanges)
        }
        setCompletedStates()

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

            return setCompletedStates()
        })

        disposables.push(
            vscode.commands.registerCommand('cody.tutorial.chat', () => {
                chatComplete = true
                setCompletedStates()
                return vscode.commands.executeCommand('cody.chat.panel.new')
            }),
            vscode.commands.registerCommand('cody.tutorial.edit', document => {
                return executeEdit({
                    configuration: {
                        document: editor.document,
                        preInstruction: 'Function that finds logs in a dir',
                    },
                })
            }),
            listenForInteractiveLineRangeUpdates,
            listenForAutocomplete,
            listenForSuccess,
            vscode.workspace.onDidCloseTextDocument(document => {
                if (document.uri !== editor.document.uri) {
                    return
                }

                // Clean up when document is closed
                for (const disposable of disposables) {
                    disposable.dispose()
                }
            })
        )
    }

    const stop = async () => {
        await vscode.commands.executeCommand('setContext', 'cody.tutorialActive', false)
        for (const disposable of activeDisposables) {
            disposable.dispose()
        }
    }

    disposables.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (!editor || editor.document.uri.fsPath !== documentUri.fsPath) {
                stop()
                return
            }

            // Tutorial is now visible, ensure it has started
            start()
        }),
        vscode.commands.registerCommand('cody.tutorial.start', start)
    )

    const activeEditor = vscode.window.activeTextEditor
    if (activeEditor && activeEditor.document.uri.fsPath === documentUri.fsPath) {
        start()
    }

    return {
        disposables,
        start,
    }
}

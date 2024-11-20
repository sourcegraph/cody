import * as vscode from 'vscode'
import { AutoEditsRenderer } from './renderer'
import {getDecorationInformation} from './diff-utils';

export function registerTestRenderCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('cody.supersuggest.testExample', () => {
        const editor = vscode.window.activeTextEditor
        const document = editor?.document
        if (!editor || !document) {
            return
        }
        const selection = editor.selection
        const offset = editor.document.offsetAt(selection.start)
        const text = editor.document.getText()

        // extract replace start line and end line, replacerText, and replacerCol
        const ret = ((): [string, string, number] | undefined => {
            const i = text.substring(0, offset).lastIndexOf('\n<<<<\n', offset)
            if (i === -1) {
                return undefined
            }
            const textToReplaceStart = i + '\n<<<<\n'.length

            const j = text.indexOf('\n====\n', textToReplaceStart)
            if (j === -1) {
                return undefined
            }
            const textToReplaceEnd = j
            const replacerTextStart = j + '\n====\n'.length

            const k = text.indexOf('\n>>>>\n', textToReplaceEnd)
            if (k === -1) {
                return undefined
            }
            const replacerTextEnd = k

            return [
                text.slice(textToReplaceStart, textToReplaceEnd),
                text.slice(replacerTextStart, replacerTextEnd),
                replacerTextEnd + '\n~~~~\n'.length,
            ]
        })()
        if (!ret) {
            return
        }
        const [textToReplace, replacerText, replacerBlockEnd] = ret

        // Display decoration
        const replaceStartOffset = text.indexOf(textToReplace, replacerBlockEnd)
        if (replaceStartOffset === -1) {
            console.error('Could not find replacement text')
            return
        }
        const replaceEndOffset = replaceStartOffset + textToReplace.length
        const replaceStartLine = editor.document.positionAt(replaceStartOffset).line
        const replaceEndLine = editor.document.positionAt(replaceEndOffset).line

        const renderer = new AutoEditsRenderer(editor)
        const currentFileText = document.getText()
        // splice replacerText into currentFileText at replaceStartLine and replacenEndLine
        const lines = currentFileText.split('\n')
        const predictedFileText = [
            ...lines.slice(0, replaceStartLine),
            replacerText,
            ...lines.slice(replaceEndLine + 1),
        ].join('\n')
        const decorationInformation = getDecorationInformation(currentFileText, predictedFileText)
        renderer.renderDecorations(decorationInformation)

        const listener = vscode.window.onDidChangeTextEditorSelection(e => {
            renderer.clearDecorations()
            listener.dispose()
        })
    })
}

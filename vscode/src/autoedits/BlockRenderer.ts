import * as vscode from 'vscode'
import { GHOST_TEXT_COLOR } from '../commands/GhostHintDecorator'

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
        const ret = ((): [string, string, number, number] | undefined => {
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

            const k = text.indexOf('\n~~~~\n', textToReplaceEnd)
            if (k === -1) {
                return undefined
            }
            const replacerTextEnd = k

            const metadataStart = k + '\n~~~~\n'.length
            const l = text.indexOf('\n>>>>\n', replacerTextEnd)
            if (l === -1) {
                return undefined
            }
            const metadataEnd = l
            const metadata = text.slice(metadataStart, metadataEnd)
            const parsedMetadata = JSON.parse(metadata)

            return [
                text.slice(textToReplaceStart, textToReplaceEnd),
                text.slice(replacerTextStart, replacerTextEnd),
                replacerTextEnd + '\n~~~~\n'.length,
                parsedMetadata.minReplacerCol ?? 20,
            ]
        })()
        if (!ret) {
            return
        }
        const [textToReplace, replacerText, replacerBlockEnd, minReplacerCol] = ret

        // Display decoration
        const replaceStartOffset = text.indexOf(textToReplace, replacerBlockEnd)
        if (replaceStartOffset === -1) {
            console.error('Could not find replacement text')
            return
        }
        const replaceEndOffset = replaceStartOffset + textToReplace.length
        const replaceStartLine = editor.document.positionAt(replaceStartOffset).line
        const replaceEndLine = editor.document.positionAt(replaceEndOffset).line
        const dismissEdit = renderBlockEdit({
            editor,
            replaceStartLine,
            replaceEndLine,
            replacerText,
            minReplacerCol,
        })

        const listener = vscode.window.onDidChangeTextEditorSelection(e => {
            // TODO(beyang): check context
            dismissEdit()
            listener.dispose()
        })
        // TODO(beyang): handle escape and tab

        // setTimeout(dismissEdit, 5_000)
    })
}

// red with opacity 0.1
const toReplaceBackgroundColor = 'rgb(255, 100, 100, 0.1)'

// green with opacity 0.1
const replacerBackgroundColor = 'rgb(100, 255, 100, 0.1)'

const toReplaceDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: toReplaceBackgroundColor,
})

const replacerDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'red', // canary (shouldn't be visible)
    before: {
        backgroundColor: replacerBackgroundColor,
        color: GHOST_TEXT_COLOR,
        height: '100%',
    },
})

const hideRemainderDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0',
})

interface BlockEdit {
    editor: vscode.TextEditor
    replaceStartLine: number
    replaceEndLine: number
    replacerText: string
    minReplacerCol: number
}

// TODO(beyang): deal with tabs...
export function renderBlockEdit({
    editor,
    replaceStartLine,
    replaceEndLine,
    replacerText,
    minReplacerCol,
}: BlockEdit): () => void {
    const replaceDecorations: vscode.DecorationOptions[] = []
    const hideRemainderDecorations: vscode.DecorationOptions[] = []

    let replacerCol = minReplacerCol
    if (editor.selection.end.character > minReplacerCol) {
        replacerCol = editor.selection.end.character
    }

    for (let i = replaceStartLine; i < replaceEndLine; i++) {
        const line = editor.document.lineAt(i)
        if (line.range.end.character <= replacerCol) {
            const options = {
                // range: new vscode.Range(i, 0, i, Math.max(line.range.end.character - 1, 0)),
                range: new vscode.Range(i, 0, i, line.range.end.character),
            }
            replaceDecorations.push(options)
        } else {
            replaceDecorations.push({
                range: new vscode.Range(i, 0, i, replacerCol),
            })
        }
    }
    editor.setDecorations(toReplaceDecorationType, replaceDecorations)

    const replacerDecorations: vscode.DecorationOptions[] = []
    // TODO(beyang): handle when not enough remaining lines in the doc
    for (let i = 0; i < replacerText.split('\n').length; i++) {
        const j = i + replaceStartLine
        const line = editor.document.lineAt(j)
        if (line.range.end.character <= replacerCol) {
            const replacerOptions: vscode.DecorationOptions = {
                range: new vscode.Range(j, line.range.end.character, j, line.range.end.character),
                renderOptions: {
                    before: {
                        contentText:
                            '\u00A0'.repeat(3) +
                            replaceLeadingChars(replacerText.split('\n')[i], ' ', '\u00A0'), // TODO(beyang): factor out
                        margin: `0 0 0 ${replacerCol - line.range.end.character}ch`,
                    },
                },
            }
            replacerDecorations.push(replacerOptions)
        } else {
            const replacerOptions: vscode.DecorationOptions = {
                range: new vscode.Range(j, replacerCol, j, replacerCol),
                renderOptions: {
                    before: {
                        contentText:
                            '\u00A0' + replaceLeadingChars(replacerText.split('\n')[i], ' ', '\u00A0'), // TODO(beyang): factor out
                    },
                },
            }
            replacerDecorations.push(replacerOptions)
        }
    }
    editor.setDecorations(replacerDecorationType, replacerDecorations)

    for (
        let i = replaceStartLine;
        i < Math.max(replaceEndLine, replaceStartLine + replacerText.split('\n').length);
        i++
    ) {
        const line = editor.document.lineAt(i)
        if (line.range.end.character > replacerCol) {
            const options = {
                range: new vscode.Range(i, replacerCol, i, line.range.end.character),
            }
            hideRemainderDecorations.push(options)
        }
    }
    editor.setDecorations(hideRemainderDecorationType, hideRemainderDecorations)

    return () => {
        editor.setDecorations(toReplaceDecorationType, [])
        editor.setDecorations(replacerDecorationType, [])
        editor.setDecorations(hideRemainderDecorationType, [])
    }
}

/**
 * Replaces leading occurrences of a character with another string
 * @param str The input string to process
 * @param oldS The character to replace
 * @param newS The character/string to replace with
 * @returns The string with leading characters replaced
 */
function replaceLeadingChars(str: string, oldS: string, newS: string): string {
    for (let i = 0; i < str.length; i++) {
        if (str[i] !== oldS) {
            // a string that is `newS` repeated i times
            return newS.repeat(i) + str.substring(i)
        }
    }
    return str
}

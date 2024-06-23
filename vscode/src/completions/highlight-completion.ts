import * as vscode from 'vscode'

import { logDebug } from '@sourcegraph/cody-shared'

export async function highlightCompletion(params: {
    range: vscode.Range
    insertText: string
    document: vscode.TextDocument
}): Promise<void> {
    try {
        const { insertText, range, document } = params
        const editor = vscode.window.visibleTextEditors.find(editor => editor.document === document)
        if (!editor) {
            logDebug('highlight-completion', 'no editor')
            return
        }
        if (typeof insertText !== 'string') {
            logDebug('highlight-completion', 'not string')
            return
        }
        if (!range) {
            logDebug('highlight-completion', 'no range')
            return
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('cody.fixup.conflictBackground'),
            borderColor: new vscode.ThemeColor('cody.fixup.conflictBorder'),
            borderStyle: 'solid',
            borderWidth: '1px',
        })

        const newPosition = textPosition(insertText)
        const newRange = new vscode.Range(
            range.start,
            new vscode.Position(
                range.start.line + newPosition.line,
                range.start.character + newPosition.character
            )
        )
        editor.setDecorations(decorationType, [newRange])
        // const disposable = vscode.window.onDidChangeTextEditorSelection(() => {
        // decorationType.dispose()
        // disposable.dispose()
        // })
    } catch (error) {
        logDebug('highlight-completion', 'unexpected error', error)
    }
}

function textPosition(text: string): { line: number; character: number } {
    const line = [...text.matchAll(/\n/g)].length // TODO: count newlines more simply
    const lastNewline = text.lastIndexOf('\n')
    const character = lastNewline < 0 ? text.length : text.length - lastNewline - 1
    return { line, character }
}

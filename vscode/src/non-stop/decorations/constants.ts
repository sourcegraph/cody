import * as vscode from 'vscode'

/**
 * We do not want our line decorations to expand when edits occur in the document.
 * They should only reflect the diff that Cody generates.
 */
const RANGE_BEHAVIOUR = vscode.DecorationRangeBehavior.ClosedClosed

export const CURRENT_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    rangeBehavior: RANGE_BEHAVIOUR,
})

export const UNVISITED_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.unchangedCodeBackground'),
    rangeBehavior: RANGE_BEHAVIOUR,
})

export const INSERTED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
    rangeBehavior: RANGE_BEHAVIOUR,
})

export const REMOVED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
    rangeBehavior: RANGE_BEHAVIOUR,
})

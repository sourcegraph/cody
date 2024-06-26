import * as vscode from 'vscode'

export const CURRENT_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

export const UNVISITED_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.unchangedCodeBackground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

export const INSERTED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

export const REMOVED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

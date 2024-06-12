import * as vscode from 'vscode'

export const CURRENT_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

export const UNVISITED_LINE_DECORATION = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
})

export const INSERTED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    isWholeLine: true,
})

export const REMOVED_CODE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    isWholeLine: true,
})

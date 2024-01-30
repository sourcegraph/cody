import type * as vscode from 'vscode'

export interface EditRangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
    selectionRange?: vscode.Range
}

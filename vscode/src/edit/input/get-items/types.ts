import type * as vscode from 'vscode'
import type { EditModel } from '@sourcegraph/cody-shared'

export interface EditRangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
}

export interface EditModelItem extends vscode.QuickPickItem {
    model: EditModel
}

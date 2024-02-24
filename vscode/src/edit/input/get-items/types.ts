import type { EditModel } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

export interface EditRangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
}

export interface EditModelItem extends vscode.QuickPickItem {
    modelTitle: string
    model: EditModel
    codyProOnly: boolean
}

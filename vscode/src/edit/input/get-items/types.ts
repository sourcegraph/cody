import type * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'

export interface EditRangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
}

export interface EditModelItem extends vscode.QuickPickItem {
    model: EditSupportedModels
}

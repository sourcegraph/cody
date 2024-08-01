import type { ChatModel, EditModel } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'

export interface EditRangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
}

export interface ModelItem<T extends EditModel | ChatModel = EditModel> extends vscode.QuickPickItem {
    modelTitle: string
    model: T
    codyProOnly: boolean
}

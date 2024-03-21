import type { ChatModel, EditModel } from '@sourcegraph/cody-shared'
import type { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import type * as vscode from 'vscode'

export interface RangeItem extends vscode.QuickPickItem {
    range: vscode.Range | (() => Promise<vscode.Range>)
}

export interface ModelItem extends vscode.QuickPickItem {
    modelTitle: string
    model: EditModel | ChatModel
    usage: ModelUsage[]
    codyProOnly: boolean
}

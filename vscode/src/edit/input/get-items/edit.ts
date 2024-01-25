import * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'
import type { EditIntent, EditRangeSource } from '../../types'
import type { GetItemsResult } from '../quick-pick'
import { RANGE_ITEMS } from './range'
import { MODEL_ITEMS } from './model'

export const RANGE_ITEM: vscode.QuickPickItem = {
    label: 'Range',
    alwaysShow: true,
}

export const MODEL_ITEM: vscode.QuickPickItem = {
    label: 'Model',
    alwaysShow: true,
}

export const DOCUMENT_ITEM: vscode.QuickPickItem = {
    label: 'Document',
    detail: 'Add code documentation',
    alwaysShow: true,
}

export const TEST_ITEM: vscode.QuickPickItem = {
    label: 'Test',
    detail: 'Generate unit tests',
    alwaysShow: true,
}

const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    detail: 'Enter your instructions (@ to include code)',
    alwaysShow: true,
}

export const getEditInputItems = (
    intent: EditIntent,
    activeValue: string,
    activeRangeSource: EditRangeSource,
    activeModel: EditSupportedModels
): GetItemsResult => {
    const items: vscode.QuickPickItem[] = []

    if (activeValue.trim().length > 0) {
        items.push(SUBMIT_ITEM)
    }

    items.push({
        label: 'edit options',
        kind: vscode.QuickPickItemKind.Separator,
    })

    if (intent === 'edit') {
        items.push({ ...RANGE_ITEM, detail: RANGE_ITEMS[activeRangeSource].label })
    }

    // Ever-present items
    items.push(
        { ...MODEL_ITEM, detail: MODEL_ITEMS[activeModel].label },
        {
            label: 'commands',
            kind: vscode.QuickPickItemKind.Separator,
        },
        DOCUMENT_ITEM
    )

    const config = vscode.workspace.getConfiguration('cody')
    const unstableTestCommandEnabled = config.get('internal.unstable') as boolean
    if (unstableTestCommandEnabled) {
        items.push(TEST_ITEM)
    }

    return { items }
}

import * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'
import type { GetItemsResult } from '../quick-pick'
import { MODEL_ITEMS } from './model'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'

export const RANGE_ITEM: vscode.QuickPickItem = {
    label: 'Range',
    alwaysShow: true,
}

export const MODEL_ITEM: vscode.QuickPickItem = {
    label: 'Model',
    alwaysShow: true,
}

export const DOCUMENT_ITEM: vscode.QuickPickItem = {
    label: 'Document Code...',
    detail: 'Add code documentation',
    alwaysShow: true,
}

export const TEST_ITEM: vscode.QuickPickItem = {
    label: 'Generate Tests...',
    detail: 'Generate unit tests',
    alwaysShow: true,
}

const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    detail: 'Submit edit instruction (or type @ to include code)',
    alwaysShow: true,
}

const getItemLabel = (item: vscode.QuickPickItem) => {
    return item.label
        .replace(QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX, '')
        .replace(QUICK_PICK_ITEM_CHECKED_PREFIX, '')
        .trim()
}

export const getEditInputItems = (
    activeValue: string,
    activeRangeItem: vscode.QuickPickItem,
    activeModel: EditSupportedModels
): GetItemsResult => {
    const items = [
        activeValue.trim().length > 0 ? SUBMIT_ITEM : null,
        {
            label: 'edit options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        { ...RANGE_ITEM, detail: getItemLabel(activeRangeItem) },
        { ...MODEL_ITEM, detail: MODEL_ITEMS[activeModel].label },
        {
            label: 'edit commands',
            kind: vscode.QuickPickItemKind.Separator,
        },
        DOCUMENT_ITEM,
    ].filter(Boolean) as vscode.QuickPickItem[]

    const config = vscode.workspace.getConfiguration('cody')
    const unstableTestCommandEnabled = config.get('internal.unstable') as boolean
    if (unstableTestCommandEnabled) {
        items.push(TEST_ITEM)
    }

    return { items }
}

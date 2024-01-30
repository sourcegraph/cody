import * as vscode from 'vscode'
import type { GetItemsResult } from '../quick-pick'
import { getItemLabel } from '../utils'

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

export const getEditInputItems = (
    activeValue: string,
    activeRangeItem: vscode.QuickPickItem,
    activeModelItem: vscode.QuickPickItem
): GetItemsResult => {
    const items = [
        activeValue.trim().length > 0 ? SUBMIT_ITEM : null,
        {
            label: 'edit options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        { ...RANGE_ITEM, detail: getItemLabel(activeRangeItem) },
        { ...MODEL_ITEM, detail: getItemLabel(activeModelItem) },
        {
            label: 'edit commands',
            kind: vscode.QuickPickItemKind.Separator,
        },
        DOCUMENT_ITEM,
        TEST_ITEM,
    ].filter(Boolean) as vscode.QuickPickItem[]

    return { items }
}

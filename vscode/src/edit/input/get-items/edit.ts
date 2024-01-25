import * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'
import type { EditMode, EditRangeSource } from '../../types'
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
    mode: EditMode,
    activeValue: string,
    activeRange: EditRangeSource,
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

    if (mode !== 'file' && mode !== 'insert') {
        items.push({ ...RANGE_ITEM, detail: RANGE_ITEMS[activeRange].label })
    }
    items.push({ ...MODEL_ITEM, detail: MODEL_ITEMS[activeModel].label })

    items.push(
        {
            label: 'commands',
            kind: vscode.QuickPickItemKind.Separator,
        },
        DOCUMENT_ITEM,
        TEST_ITEM
    )

    return {
        items,
    }
}

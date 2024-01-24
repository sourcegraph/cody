import * as vscode from 'vscode'
import type { EditInputParams } from './get-input'
import type { EditSupportedModels } from '../prompt'
import type { EditRangeSource } from '../types'

export const RANGE_ITEM: vscode.QuickPickItem = {
    label: 'Range',
    alwaysShow: true,
}

export const MODEL_ITEM: vscode.QuickPickItem = {
    label: 'Model',
    alwaysShow: true,
}

const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    detail: 'Enter your instructions (@ to include code)',
    alwaysShow: true,
}

export const getEditInputItems = (
    params: EditInputParams,
    activeValue: string,
    activeRange: EditRangeSource,
    activeModel: EditSupportedModels
) => {
    const items: vscode.QuickPickItem[] = []

    if (activeValue.trim().length > 0) {
        items.push(SUBMIT_ITEM)
    }
    items.push({
        label: 'modifiers',
        kind: vscode.QuickPickItemKind.Separator,
    })

    if (params.mode !== 'file' && params.mode !== 'insert') {
        items.push({ ...RANGE_ITEM, detail: RANGE_ITEMS[activeRange].label })
    }
    items.push({ ...MODEL_ITEM, detail: MODEL_ITEMS[activeModel].label })

    return items
}

export const RANGE_ITEMS: Record<EditRangeSource, vscode.QuickPickItem> = {
    selection: {
        label: '$(code) Selection',
        alwaysShow: true,
    },
    expanded: {
        label: '$(file-code) Expanded selection',
        description: 'Expand the selection to the nearest block of code',
        alwaysShow: true,
    },
    maximum: {
        label: '$(symbol-file) Maximum',
        description: 'The maximum expanded selection',
        alwaysShow: true,
    },
} as const

export const getRangeInputItems = (params: EditInputParams, activeRangeType: EditRangeSource) => {
    const activeItem = RANGE_ITEMS[activeRangeType]
    const remainingItems = Object.entries(RANGE_ITEMS)
        .filter(([key]) => key !== activeRangeType)
        .map(([_, item]) => item)

    return [
        {
            label: 'active',
            kind: vscode.QuickPickItemKind.Separator,
        },
        activeItem,
        {
            label: 'options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        ...remainingItems,
    ]
}

const MODEL_ITEMS: Record<EditSupportedModels, vscode.QuickPickItem> = {
    'anthropic/claude-2.1': {
        label: '$(anthropic-logo) Claude 2.1',
        description: 'by Anthropic',
        alwaysShow: true,
    },
    'anthropic/claude-instant-1.2': {
        label: '$(anthropic-logo) Claude Instant',
        description: 'by Anthropic',
        alwaysShow: true,
    },
} as const

export const getModelInputItems = (params: EditInputParams, activeModel: EditSupportedModels) => {
    const activeItem = MODEL_ITEMS[activeModel]
    const remainingItems = Object.entries(MODEL_ITEMS)
        .filter(([key]) => key !== activeModel)
        .map(([_, item]) => item)

    return [
        {
            label: 'active',
            kind: vscode.QuickPickItemKind.Separator,
        },
        activeItem,
        {
            label: 'options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        ...remainingItems,
    ]
}

import * as vscode from 'vscode'
import type { EditRangeSource } from '../../types'
import type { GetItemsResult } from '../quick-pick'

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

export const getRangeInputItems = (activeRangeType: EditRangeSource): GetItemsResult => {
    const activeItem = RANGE_ITEMS[activeRangeType]
    const remainingItems = Object.entries(RANGE_ITEMS)
        .filter(([key]) => key !== activeRangeType)
        .map(([_, item]) => item)

    return {
        items: [
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
        ],
    }
}

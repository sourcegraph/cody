import * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'
import type { GetItemsResult } from '../quick-pick'

export const MODEL_ITEMS: Record<EditSupportedModels, vscode.QuickPickItem> = {
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

export const getModelInputItems = (activeModel: EditSupportedModels): GetItemsResult => {
    const activeItem = MODEL_ITEMS[activeModel]
    const remainingItems = Object.entries(MODEL_ITEMS)
        .filter(([key]) => key !== activeModel)
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

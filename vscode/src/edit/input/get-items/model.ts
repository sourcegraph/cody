import type * as vscode from 'vscode'
import type { EditSupportedModels } from '../../prompt'
import type { GetItemsResult } from '../quick-pick'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'

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
    const items = Object.values(MODEL_ITEMS).map(item => {
        const labelPrefix =
            item === MODEL_ITEMS[activeModel]
                ? QUICK_PICK_ITEM_CHECKED_PREFIX
                : QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX
        return { ...item, label: labelPrefix + item?.label }
    })
    const activeItem = items.find(item => item.label.startsWith(QUICK_PICK_ITEM_CHECKED_PREFIX))

    return {
        items,
        activeItems: activeItem ? [activeItem] : undefined,
    }
}

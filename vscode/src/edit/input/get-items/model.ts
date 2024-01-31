import type { GetItemsResult } from '../quick-pick'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { EditModelItem } from './types'

export const DEFAULT_MODEL_ITEM: EditModelItem = {
    label: '$(anthropic-logo) Claude 2.1',
    description: 'by Anthropic',
    alwaysShow: true,
    model: 'anthropic/claude-2.1',
}

export const FAST_MODEL_ITEM: EditModelItem = {
    label: '$(anthropic-logo) Claude Instant',
    description: 'by Anthropic',
    alwaysShow: true,
    model: 'anthropic/claude-instant-1.2',
}

export const getModelInputItems = (activeModelItem: EditModelItem): GetItemsResult => {
    const items = [DEFAULT_MODEL_ITEM, FAST_MODEL_ITEM].map(item => ({
        ...item,
        label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${item.label}`,
    }))

    const activeItem = items.find(item => item.model === activeModelItem.model)

    if (activeItem) {
        // Update the label of the active item
        activeItem.label = activeItem.label.replace(
            QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
            QUICK_PICK_ITEM_CHECKED_PREFIX
        )
    }

    return {
        items,
        activeItem,
    }
}

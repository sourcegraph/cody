import type { GetItemsResult } from '../quick-pick'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { EditModelItem } from './types'
import type { ChatModelProvider } from '@sourcegraph/cody-shared'

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

export const getModelProviderIcon = (provider: string): string => {
    switch (provider) {
        case 'Anthropic':
            return '$(anthropic-logo)'
        case 'OpenAI':
            return '$(openai-logo)'
        case 'Mistral':
            return '$(mistral-logo)'
        default:
            return ''
    }
}

export const getModelOptionItems = (modelOptions: ChatModelProvider[]): EditModelItem[] => {
    return modelOptions.map(modelOption => {
        const icon = getModelProviderIcon(modelOption.provider)
        return {
            label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${icon} ${modelOption.title}`,
            description: `by ${modelOption.provider}`,
            model: modelOption.model,
            alwaysShow: true,
        }
    })
}

export const getModelInputItems = (
    activeModelItem: EditModelItem | undefined,
    modelItems: EditModelItem[]
): GetItemsResult => {
    const activeItem = modelItems.find(item => item.model === activeModelItem?.model)

    if (activeItem) {
        // Update the label of the active item
        activeItem.label = activeItem.label.replace(
            QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
            QUICK_PICK_ITEM_CHECKED_PREFIX
        )
    }

    return {
        items: modelItems,
        activeItem,
    }
}

import type { GetItemsResult } from '../quick-pick'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { EditModelItem } from './types'
import type { EditModel, ModelProvider } from '@sourcegraph/cody-shared'

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

export const getModelOptionItems = (modelOptions: ModelProvider[]): EditModelItem[] => {
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
    modelOptions: ModelProvider[],
    activeModel: EditModel
): GetItemsResult => {
    const modelItems = getModelOptionItems(modelOptions)
    const activeItem = modelItems.find(item => item.model === activeModel)

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

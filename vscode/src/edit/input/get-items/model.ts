import * as vscode from 'vscode'

import type { EditModel, ModelProvider } from '@sourcegraph/cody-shared'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { GetItemsResult } from '../quick-pick'
import type { EditModelItem } from './types'

const getModelProviderIcon = (provider: string): string => {
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

export const getModelOptionItems = (
    modelOptions: ModelProvider[],
    isCodyPro: boolean
): EditModelItem[] => {
    const allOptions = modelOptions.map(modelOption => {
        const icon = getModelProviderIcon(modelOption.provider)
        return {
            label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${icon} ${modelOption.title}`,
            description: `by ${modelOption.provider}`,
            alwaysShow: true,
            model: modelOption.model,
            modelTitle: modelOption.title,
            codyProOnly: modelOption.codyProOnly,
        }
    })

    if (!isCodyPro) {
        return [
            ...allOptions.filter(option => !option.codyProOnly),
            { label: 'upgrade to cody pro', kind: vscode.QuickPickItemKind.Separator } as EditModelItem,
            ...allOptions.filter(option => option.codyProOnly),
        ]
    }

    return allOptions
}

export const getModelInputItems = (
    modelOptions: ModelProvider[],
    activeModel: EditModel,
    isCodyPro: boolean
): GetItemsResult => {
    const modelItems = getModelOptionItems(modelOptions, isCodyPro)
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

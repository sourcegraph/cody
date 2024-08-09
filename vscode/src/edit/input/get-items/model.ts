import * as vscode from 'vscode'

import {
    type ChatModel,
    type EditModel,
    type Model,
    isCodyProModel,
    isDefined,
} from '@sourcegraph/cody-shared'
import {
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from '../../../chat/context/constants'
import type { GetItemsResult } from '../quick-pick'
import type { ModelItem } from './types'

const getModelProviderIcon = (provider: string): string => {
    switch (provider) {
        case 'Anthropic':
            return '$(anthropic-logo)'
        case 'OpenAI':
            return '$(openai-logo)'
        case 'Mistral':
            return '$(mistral-logo)'
        case 'Ollama':
            return '$(ollama-logo)'
        case 'Google':
            return '$(gemini-logo)'
        default:
            return '$(cody-logo)'
    }
}

export const getModelOptionItems = <T extends EditModel | ChatModel = EditModel>(
    modelOptions: Model[],
    isCodyPro: boolean
): T extends EditModel ? ModelItem<EditModel>[] : ModelItem<ChatModel>[] => {
    const allOptions = modelOptions
        .map(modelOption => {
            const icon = getModelProviderIcon(modelOption.provider)
            return {
                label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${icon} ${modelOption.title}`,
                description: `by ${modelOption.provider}`,
                // alwaysShow: true,
                model: modelOption.model,
                modelTitle: modelOption.title,
                codyProOnly: isCodyProModel(modelOption),
            }
        })
        .filter(isDefined)

    if (!isCodyPro) {
        return [
            ...allOptions.filter(option => !option.codyProOnly),
            { label: 'upgrade to cody pro', kind: vscode.QuickPickItemKind.Separator } as ModelItem,
            ...allOptions.filter(option => option.codyProOnly),
        ]
    }

    return allOptions
}

export const getModelInputItems = <T extends EditModel | ChatModel = EditModel>(
    modelOptions: Model[],
    activeModel: T,
    isCodyPro: boolean
): GetItemsResult<ModelItem> => {
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

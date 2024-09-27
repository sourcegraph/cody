import * as vscode from 'vscode'

import { type EditModel, type Model, isCodyProModel, isDefined } from '@sourcegraph/cody-shared'
import {
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from '../../../chat/context/constants'
import type { GetItemsResult } from '../quick-pick'
import type { EditModelItem } from './types'

const MODEL_PROVIDER_ICONS: Record<string, string> = {
    anthropic: '$(anthropic-logo)',
    openai: '$(openai-logo)',
    mistral: '$(mistral-logo)',
    ollama: '$(ollama-logo)',
    google: '$(gemini-logo)',
}

const getModelProviderIcon = (provider: string): string =>
    MODEL_PROVIDER_ICONS[provider.toLowerCase()] || '$(cody-logo)'

export const getModelOptionItems = (modelOptions: Model[], isCodyPro: boolean): EditModelItem[] => {
    const allOptions = modelOptions
        .map(modelOption => {
            const icon = getModelProviderIcon(modelOption.provider)
            const title = modelOption.title || modelOption.id
            return {
                label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${icon} ${title}`,
                description: `by ${modelOption.provider}`,
                alwaysShow: true,
                model: modelOption.id,
                modelTitle: title,
                codyProOnly: isCodyProModel(modelOption),
            }
        })
        .filter(isDefined)

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
    modelOptions: Model[],
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

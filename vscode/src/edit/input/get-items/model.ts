import * as vscode from 'vscode'

import {
    type EditModel,
    type Model,
    ModelTag,
    isCodyProModel,
    isDefined,
} from '@sourcegraph/cody-shared'
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

export const getModelOptionItems = (
    modelOptions: Model[],
    isCodyPro: boolean,
    isEnterpriseUser: boolean,
    rateLimited?: boolean
): EditModelItem[] => {
    const allOptions = modelOptions
        .map(modelOption => {
            const icon = getModelProviderIcon(modelOption.provider)
            const title = modelOption.title || modelOption.id
            const isRateLimited = rateLimited && !modelOption.tags.includes(ModelTag.Speed)
            return {
                label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${icon} ${title}`,
                description: `by ${modelOption.provider}`,
                alwaysShow: true,
                model: modelOption.id,
                modelTitle: title,
                codyProOnly: isCodyProModel(modelOption) && !isEnterpriseUser,
                disabled: isRateLimited,
            }
        })
        .filter(isDefined)

    if (!isCodyPro && !isEnterpriseUser) {
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
    isCodyPro: boolean,
    isEnterpriseUser: boolean,
    rateLimited?: boolean
): GetItemsResult => {
    const modelItems = getModelOptionItems(modelOptions, isCodyPro, isEnterpriseUser, rateLimited)

    // If the active model is disabled (rate limited), try to find a non-disabled model
    let activeItem = modelItems.find(item => item.model === activeModel)

    // If the active model is disabled, try to find a non-disabled model to use instead
    if (activeItem?.disabled) {
        // Find the first non-disabled model to use as the active model
        const firstNonDisabledModel = modelItems.find(item => !item.disabled)
        if (firstNonDisabledModel) {
            activeItem = firstNonDisabledModel
        }
    }

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

import type { ModelRef, ModelRefStr } from '.'
import { ModelTag } from '..'
import type { Model } from './model'

export function getProviderName(name: string): string {
    const providerName = name.toLowerCase()
    switch (providerName) {
        case 'anthropic':
            return 'Anthropic'
        case 'openai':
            return 'OpenAI'
        case 'ollama':
            return 'Ollama'
        case 'google':
            return 'Google'
        default:
            return providerName
    }
}

/**
 * Gets the provider and title from a model ID string.
 */
export function getModelInfo(modelID: string): {
    provider: string
    title: string
} {
    const [providerID, ...rest] = modelID.split('/')
    const provider = getProviderName(providerID)
    const title = (rest.at(-1) || '').replace(/-/g, ' ')
    return { provider, title }
}

export function isCodyProModel(model: Model): boolean {
    return modelHasTag(model, ModelTag.Pro)
}

export function isWaitlistModel(model: Model): boolean {
    return modelHasTag(model, ModelTag.Waitlist) || modelHasTag(model, ModelTag.OnWaitlist)
}

export function isCustomModel(model: Model): boolean {
    return (
        modelHasTag(model, ModelTag.Local) ||
        modelHasTag(model, ModelTag.Dev) ||
        modelHasTag(model, ModelTag.BYOK)
    )
}

function modelHasTag(model: Model, modelTag: ModelTag): boolean {
    return model.tags.includes(modelTag)
}

export function toModelRefStr(modelRef: ModelRef): ModelRefStr {
    const { providerId, apiVersionId, modelId } = modelRef
    return `${providerId}::${apiVersionId}::${modelId}`
}

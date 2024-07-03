import type { Model } from '.'
import { ModelTag } from './tags'

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

export function isCodyProModel(model?: Model): boolean {
    return Boolean(model?.tags.includes(ModelTag.Pro))
}

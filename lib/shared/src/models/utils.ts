import { type Model, ModelsService } from '.'
import { ModelTag } from '..'

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
    return ModelsService.hasModelTag(model, ModelTag.Pro)
}

export function isLocalModel(model: Model): boolean {
    return ModelsService.hasModelTag(model, ModelTag.Local)
}

export function isCustomModel(model: Model): boolean {
    return (
        ModelsService.hasModelTag(model, ModelTag.Local) ||
        ModelsService.hasModelTag(model, ModelTag.Dev) ||
        ModelsService.hasModelTag(model, ModelTag.BYOK)
    )
}

export function isOllamaModel(model: Model): boolean {
    return model.provider.toLowerCase() === 'ollama' || ModelsService.hasModelTag(model, ModelTag.Ollama)
}

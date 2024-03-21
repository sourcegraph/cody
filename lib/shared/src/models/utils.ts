export function getProviderName(name: string): string {
    const providerName = name.toLowerCase()
    switch (providerName) {
        case 'anthropic':
            return 'Anthropic'
        case 'openai':
            return 'OpenAI'
        case 'ollama':
            return 'Ollama'
        default:
            return providerName
    }
}

export function supportsFastPath(model: string): boolean {
    return model?.startsWith('anthropic/claude-3')
}

/**
 * Gets the provider and title from a model ID string.
 */
export function getModelInfo(modelID: string): {
    provider: string
    title: string
} {
    const splittedModel = modelID.split('/')
    // The name of provider of the model, e.g. "Anthropic"
    const provider = getProviderName(splittedModel[0])
    // The title/name of the model, e.g. "Claude 2.0"
    const title = (splittedModel.pop() || splittedModel[1]).replaceAll('-', ' ')
    return { provider, title }
}

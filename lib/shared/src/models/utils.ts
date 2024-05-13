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

/** Common {@link ModelProvider.uiGroup} values. */
export const ModelUIGroup: Record<string, string> = {
    Accuracy: 'Optimized for Accuracy',
    Balanced: 'Balanced (Speed & Accuracy)',
    Speed: 'Optimized for Speed',
    Ollama: 'Ollama (Local)',
}

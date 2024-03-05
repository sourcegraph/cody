export function getProviderName(name: string): string {
    const providerName = name.toLowerCase()
    switch (providerName) {
        case 'anthropic':
            return 'Anthropic'
        case 'openai':
            return 'OpenAI'
        default:
            return providerName
    }
}

export function supportsUnifiedApi(model: string): boolean {
    return model.startsWith('anthropic/claude-3')
}

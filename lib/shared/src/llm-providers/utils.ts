import type { CompletionsModelConfig } from '.'
import { ModelProvider } from '../models'

export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = ModelProvider.getProviderByModel(modelID)
    if (provider?.model.startsWith('google/') && provider?.apiKey) {
        return {
            model: provider.model.replace('google/', ''),
            key: provider.apiKey,
            endpoint: provider.apiEndpoint,
        }
    }

    if (provider?.model.startsWith('ollama/')) {
        return {
            model: provider.model.replace('ollama/', ''),
            key: provider.apiKey || '',
            endpoint: provider.apiEndpoint,
        }
    }

    if (provider?.model.startsWith('groq/') && provider?.apiKey) {
        return {
            model: provider.model.replace('groq/', ''),
            key: provider.apiKey,
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        }
    }

    return undefined
}

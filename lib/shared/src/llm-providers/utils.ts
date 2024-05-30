import type { CompletionsModelConfig } from '.'
import { ModelProvider } from '../models'

export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = ModelProvider.getProviderByModel(modelID)
    if (provider?.model.startsWith('google/') && provider.config?.apiKey) {
        return {
            model: provider.model.replace('google/', ''),
            key: provider.config.apiKey,
            endpoint: provider.config?.apiEndpoint,
        }
    }

    if (provider?.model.startsWith('ollama/')) {
        return {
            model: provider.model.replace('ollama/', ''),
            key: provider.config?.apiKey || '',
            endpoint: provider.config?.apiEndpoint,
        }
    }

    if (provider?.model.startsWith('groq/') || provider?.model.startsWith('openaicompatible/')) {
        return {
            model: provider.model.replace('groq/', '').replace('openaicompatible/', ''),
            key: provider.config?.apiKey || '',
            endpoint: provider.config?.apiEndpoint,
        }
    }

    return undefined
}

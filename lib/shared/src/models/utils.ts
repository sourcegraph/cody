import { ModelProvider } from '.'
import { logError } from '../logger'
import { OLLAMA_DEFAULT_URL } from '../ollama'
import { DEFAULT_FAST_MODEL_CHARS_LIMIT } from '../prompt/constants'
import { ModelUsage } from './types'
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
    const [providerID, ...rest] = modelID.split('/')
    const provider = getProviderName(providerID)
    const title = (rest.at(-1) || '').replace(/-/g, ' ')
    return { provider, title }
}

/**
 * Fetches available Ollama models from the Ollama server.
 */
export async function fetchLocalOllamaModels(): Promise<ModelProvider[]> {
    // TODO (bee) watch file change to determine if a new model is added
    // to eliminate the needs of restarting the extension to get the new models
    return await fetch(new URL('/api/tags', OLLAMA_DEFAULT_URL).href)
        .then(response => response.json())
        .then(
            data =>
                data?.models?.map(
                    (m: { model: string }) =>
                        new ModelProvider(
                            `ollama/${m.model}`,
                            [ModelUsage.Chat, ModelUsage.Edit],
                            DEFAULT_FAST_MODEL_CHARS_LIMIT
                        )
                ),
            error => {
                const fetchFailedErrors = ['Failed to fetch', 'fetch failed']
                const isFetchFailed = fetchFailedErrors.some(err => error.toString().includes(err))
                const serverErrorMsg = 'Please make sure the Ollama server is up & running.'
                logError('getLocalOllamaModels: failed ', isFetchFailed ? serverErrorMsg : error)
                return []
            }
        )
}

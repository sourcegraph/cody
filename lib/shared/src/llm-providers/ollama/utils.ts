import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from '.'
import { ModelProvider, ModelUsage, OLLAMA_DEFAULT_URL, logError } from '../..'

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
                        new ModelProvider(`ollama/${m.model}`, [ModelUsage.Chat, ModelUsage.Edit], {
                            chat: OLLAMA_DEFAULT_CONTEXT_WINDOW,
                            user: 0,
                            enhanced: 0,
                        })
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

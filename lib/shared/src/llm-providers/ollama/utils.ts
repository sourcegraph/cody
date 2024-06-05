import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from '.'
import { Model, ModelUIGroup, ModelUsage, OLLAMA_DEFAULT_URL, logError } from '../..'
import { CHAT_OUTPUT_TOKEN_BUDGET } from '../../token/constants'

/**
 * Fetches available Ollama models from the Ollama server.
 */
export async function fetchLocalOllamaModels(): Promise<Model[]> {
    // TODO (bee) watch file change to determine if a new model is added
    // to eliminate the needs of restarting the extension to get the new models
    return await fetch(new URL('/api/tags', OLLAMA_DEFAULT_URL).href)
        .then(response => response.json())
        .then(
            data =>
                data?.models?.map(
                    (m: { model: string }) =>
                        new Model(
                            `ollama/${m.model}`,
                            [ModelUsage.Chat, ModelUsage.Edit],
                            {
                                input: OLLAMA_DEFAULT_CONTEXT_WINDOW,
                                output: CHAT_OUTPUT_TOKEN_BUDGET,
                            },
                            undefined,
                            ModelUIGroup.Ollama
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

import type { CompletionsModelConfig } from '.'
import { ModelsService } from '../models'

/**
 * Retrieves the configuration for a completions model by its ID.
 *
 * @param modelID - The ID of the model to retrieve the configuration for.
 * @returns The configuration for the specified completions model, or `undefined` if the model is not found.
 */
export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = ModelsService.getModelByID(modelID)
    if (!provider) {
        return undefined
    }

    const {
        model,
        config: { apiKey = '', apiEndpoint } = {},
    } = provider

    return { model, key: apiKey, endpoint: apiEndpoint }
}

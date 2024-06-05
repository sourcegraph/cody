import type { CompletionsModelConfig } from '.'
import { ModelsService } from '../models'

export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = ModelsService.getModelByID(modelID)
    if (!provider) {
        return undefined
    }

    const {
        model,
        config: { apiKey = '', apiEndpoint } = {},
    } = provider
    const strippedModelName = model.split('/').pop() || model

    return {
        model: strippedModelName,
        key: apiKey,
        endpoint: apiEndpoint,
    }
}

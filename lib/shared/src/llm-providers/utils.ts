import type { CompletionsModelConfig } from '.'
import { modelsService } from '../models'

export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = modelsService.instance!.getModelByID(modelID)
    if (!provider) {
        return undefined
    }

    const {
        id: model,
        clientSideConfig: { apiKey = '', apiEndpoint } = {},
    } = provider
    const strippedModelName = model.split('/').pop() || model

    return {
        model: strippedModelName,
        key: apiKey,
        endpoint: apiEndpoint,
    }
}

import type { CompletionsModelConfig } from '.'
import { modelsService } from '../models/modelsService'

export function getCompletionsModelConfig(modelID: string): CompletionsModelConfig | undefined {
    const provider = modelsService.getModelByID(modelID)
    if (!provider) {
        return undefined
    }

    const { id, clientSideConfig = {} } = provider
    const { apiKey = '', apiEndpoint, options = {} } = clientSideConfig

    const prefix = provider.provider.toLowerCase() + '/'
    const model = id.startsWith(prefix) ? id.substring(prefix.length) : id
    const stream = Boolean(options?.stream ?? true)

    const { stream: _, ...restOptions } = options || {}

    return {
        model,
        key: apiKey,
        endpoint: apiEndpoint,
        stream,
        options: restOptions,
    }
}

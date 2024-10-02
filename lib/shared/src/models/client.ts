import type { ServerModel } from '..'
import type { ModelTag } from './tags'

/**
 * Provides a list of experimental Sourcegraph client-side models that are not recognized by the backend.
 * These models are used for experimental features and functionality on the client-side.
 *
 * @returns {ServerModel[]} The list of experimental client-side models.
 */
export function getExperimentalClientModels(): ServerModel[] {
    return CLIENT_EXPERIMENTAL_MODELS
}

/**
 * Sourcegraph experimental models that do not exist or are not recognized in the backend.
 * - Deep Cody: Wrapper for the 3.5 Sonnet model with function calling capabilities.
 */
const CLIENT_EXPERIMENTAL_MODELS = [
    // This modelRef does not exist in the backend and is used to identify the model in the client.
    {
        modelRef: 'sourcegraph::2023-06-01::deep-cody',
        displayName: 'Deep Cody',
        modelName: 'deep-cody',
        capabilities: ['chat'],
        category: 'accuracy',
        status: 'internal' as ModelTag.Internal,
        tier: 'free' as ModelTag.Free,
        contextWindow: {
            maxInputTokens: 45000,
            maxOutputTokens: 4000,
        },
    },
] as const satisfies ServerModel[]

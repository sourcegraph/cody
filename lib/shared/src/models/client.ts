import type { ServerModel } from '..'
import type { ModelTag } from './tags'

const CLIENT_EXPERIMENTAL_MODELS = [
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

export function getExperimentalClientModels(): ServerModel[] {
    return CLIENT_EXPERIMENTAL_MODELS
}

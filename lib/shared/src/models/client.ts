import type { ServerModel } from '..'
import type { ModelTag } from './tags'

const CLIENT_EXPERIMENTAL_MODELS = [
    {
        modelRef: 'anthropic::2023-06-01::cody-reflection',
        displayName: 'Cody Reflection',
        modelName: 'cody-reflection',
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

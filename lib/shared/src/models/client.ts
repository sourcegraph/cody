import { FeatureFlag, type ServerModel } from '..'
import type { ModelTag } from './tags'

/**
 * Provides a list of experimental Sourcegraph client-side models that are not recognized by the backend.
 * These models are used for experimental features and functionality on the client-side.
 *
 * @returns {ServerModel[]} The list of experimental client-side models.
 */
export function getExperimentalClientModelByFeatureFlag(flag: FeatureFlag): ServerModel | null {
    switch (flag) {
        case FeatureFlag.DeepCody:
            return DEEP_CODY_CLIENT_MODEL
        default:
            return null
    }
}

const DEEP_CODY_CLIENT_MODEL: ServerModel = {
    // This modelRef does not exist in the backend and is used to identify the model in the client.
    modelRef: 'sourcegraph::2023-06-01::deep-cody',
    displayName: '🧠 Deep Cody',
    modelName: 'deep-cody',
    capabilities: ['chat'],
    category: 'accuracy',
    status: 'internal' as ModelTag.Internal,
    tier: 'free' as ModelTag.Free,
    contextWindow: {
        maxInputTokens: 45000,
        maxOutputTokens: 4000,
    },
}

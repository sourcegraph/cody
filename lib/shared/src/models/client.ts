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
            return getDeepCodyServerModel()
        default:
            return null
    }
}

export const DeepCodyAgentID = 'deep-cody'

function getDeepCodyServerModel(): ServerModel {
    return {
        // This modelRef does not exist in the backend and is used to identify the model in the client.
        modelRef: 'sourcegraph::2023-06-01::deep-cody',
        displayName: 'Agentic chat',
        modelName: DeepCodyAgentID,
        capabilities: ['chat'],
        category: 'accuracy',
        status: 'experimental' as ModelTag.Experimental,
        tier: 'pro' as ModelTag.Pro,
        contextWindow: {
            maxInputTokens: 45000,
            maxOutputTokens: 4000,
        },
    }
}

export const TOOL_CODY_MODEL: ServerModel = {
    modelRef: 'sourcegraph::2024-12-31::tool-cody',
    displayName: 'Tool Cody',
    modelName: 'tool-cody',
    capabilities: ['chat'],
    category: 'accuracy',
    status: 'internal' as ModelTag.Internal,
    tier: 'pro' as ModelTag.Pro,
    contextWindow: {
        maxInputTokens: 45000,
        maxOutputTokens: 4000,
    },
}

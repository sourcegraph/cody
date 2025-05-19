import type { ServerModel } from './model'
import type { ModelTag } from './tags'

export const DeepCodyAgentID = 'deep-cody'
export const DeepCodyModelRef = 'sourcegraph::2023-06-01::deep-cody'

export const ToolCodyModelName = 'tool-cody'

export const DEEP_CODY_MODEL: ServerModel = {
    // This modelRef does not exist in the backend and is used to identify the model in the client.
    modelRef: DeepCodyModelRef,
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

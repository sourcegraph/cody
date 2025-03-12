import type { ServerModel } from '..'
import type { ModelTag } from './tags'

// @deprecated Now called the agentic chat
export const DeepCodyAgentID = 'deep-cody'
export const DeepCodyModelRef = 'sourcegraph::2023-06-01::deep-cody'
export const ToolCodyModelRef = 'sourcegraph::2024-12-31::tool-cody'
export const ToolCodyModelName = 'tool-cody'

export const TOOL_CODY_MODEL: ServerModel = {
    modelRef: ToolCodyModelRef,
    displayName: 'Tool Cody',
    modelName: ToolCodyModelName,
    capabilities: ['chat'],
    category: 'accuracy',
    status: 'internal' as ModelTag.Internal,
    tier: 'pro' as ModelTag.Pro,
    contextWindow: {
        maxInputTokens: 45000,
        maxOutputTokens: 4000,
    },
}

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

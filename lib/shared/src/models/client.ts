import type { ServerModel } from '..'
import type { ModelTag } from './tags'

// @deprecated Now called the agentic chat
export const DeepCodyAgentID = 'deep-cody'

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

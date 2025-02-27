import Anthropic from '@anthropic-ai/sdk'
import { DeepCodyAgentID, ToolCodyModelRef } from '@sourcegraph/cody-shared/src/models/client'
import { getConfiguration } from '../../../configuration'
import { AgenticGeminiHandler } from './AgenticGeminiHandler'
import { AgenticHandler } from './AgenticHandler'
import { ChatHandler } from './ChatHandler'
import { DeepCodyHandler } from './DeepCodyHandler'
import { EditHandler } from './EditHandler'
import { SearchHandler } from './SearchHandler'
import { ExperimentalToolHandler } from './ToolHandler'
import type { AgentHandler, AgentTools } from './interfaces'

/**
 * The agentRegistry registers agent handlers under IDs which can then be invoked
 * at query time to retrieve the appropriate handler for a user request.
 */
const agentRegistry = new Map<string, (id: string, tools: AgentTools) => AgentHandler>()

function registerAgent(id: string, ctr: (id: string, tools: AgentTools) => AgentHandler) {
    agentRegistry.set(id, ctr)
}

export function getAgent(id: string, modelId: string, tools: AgentTools): AgentHandler {
    // NOTE: WIP
    const agenticChat = getAgentPrototype(modelId, tools)
    if (agenticChat) {
        return agenticChat
    }

    const { contextRetriever, editor, chatClient } = tools
    if (id === DeepCodyAgentID) {
        return new DeepCodyHandler(modelId, contextRetriever, editor, chatClient)
    }
    if (agentRegistry.has(id)) {
        return agentRegistry.get(id)!(id, tools)
    }
    // If id is not found, assume it's a base model
    return new ChatHandler(modelId, contextRetriever, editor, chatClient)
}

registerAgent('search', (_id: string, _tools: AgentTools) => new SearchHandler())
registerAgent(
    'edit',
    (_id: string, { contextRetriever, editor }: AgentTools) =>
        new EditHandler('edit', contextRetriever, editor)
)
registerAgent(
    'insert',
    (_id: string, { contextRetriever, editor }: AgentTools) =>
        new EditHandler('insert', contextRetriever, editor)
)
registerAgent(ToolCodyModelRef, (_id: string) => {
    const config = getConfiguration()
    const anthropicAPI = new Anthropic({
        apiKey: config.experimentalMinionAnthropicKey,
    })
    return new ExperimentalToolHandler(anthropicAPI)
})

// NOTE: WIP - prototypes
function getAgentPrototype(modelId: string, tools: AgentTools): AgentHandler | undefined {
    const { contextRetriever, editor, chatClient } = tools
    const config = getConfiguration()
    const minion = config?.experimentalMinionAnthropicKey
    const anthropic = config?.devModels?.find(m => m.provider.includes('anthropic'))?.apiKey ?? minion
    const gemini = config?.devModels?.find(m => m.provider.includes('google'))?.apiKey
    if (modelId.includes('sonnet') && anthropic) {
        return new AgenticHandler(modelId, contextRetriever, editor, chatClient, anthropic)
    }
    if (modelId.includes('gemini') && gemini) {
        return new AgenticGeminiHandler(modelId, contextRetriever, editor, chatClient, gemini)
    }
    return undefined
}

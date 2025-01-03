import { DeepCodyAgent } from '../../agentic/DeepCody'
import { ChatHandler } from './ChatHandler'
import { DeepCodyHandler } from './DeepCodyHandler'
import { EditHandler } from './EditHandler'
import { SearchHandler } from './SearchHandler'
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
    const { contextRetriever, editor, chatClient, codyToolProvider } = tools
    if (id === DeepCodyAgent.id) {
        return new DeepCodyHandler(modelId, contextRetriever, editor, chatClient, codyToolProvider)
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

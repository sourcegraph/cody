import Anthropic from '@anthropic-ai/sdk'
import { getConfiguration } from '../../../configuration'
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

export function getAgent(id: string, tools: AgentTools): AgentHandler {
    if (!agentRegistry.has(id)) {
        // If id is not found, assume it's a base model
        const { contextRetriever, editor, chatClient } = tools
        return new ChatHandler(id, contextRetriever, editor, chatClient)
    }
    return agentRegistry.get(id)!(id, tools)
}

registerAgent(
    'sourcegraph::2023-06-01::deep-cody',
    (id: string, { contextRetriever, editor, chatClient, codyToolProvider }: AgentTools) =>
        new DeepCodyHandler(id, contextRetriever, editor, chatClient, codyToolProvider)
)
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
registerAgent('sourcegraph::2024-12-31::tool-cody', (_id: string) => {
    const config = getConfiguration()
    const anthropicAPI = new Anthropic({
        apiKey: config.experimentalMinionAnthropicKey,
    })
    return new ExperimentalToolHandler(anthropicAPI)
})

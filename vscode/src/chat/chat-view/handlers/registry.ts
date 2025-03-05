import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID, ToolCodyModelRef } from '@sourcegraph/cody-shared/src/models/client'
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
    const { contextRetriever, editor, chatClient } = tools
    if (agentRegistry.has(id)) {
        return agentRegistry.get(id)!(id, tools)
    }
    // If id is not found, assume it's a base model
    return new ChatHandler(id, contextRetriever, editor, chatClient)
}

registerAgent(
    DeepCodyAgentID,
    (id: string, { contextRetriever, editor, chatClient }: AgentTools) =>
        new DeepCodyHandler(id, contextRetriever, editor, chatClient)
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
registerAgent(ToolCodyModelRef, (_id: string) => {
    const config = getConfiguration()
    const anthropicAPI = new Anthropic({
        apiKey: config.experimentalMinionAnthropicKey,
    })
    return new ExperimentalToolHandler(anthropicAPI)
})

export function getAgentName(intent: ChatMessage['intent'], model?: string): string | undefined {
    if (intent === 'agentic') {
        return DeepCodyAgentID
    }
    // Uses the model name as the agent name for chat intents.
    return (intent !== 'chat' && intent) || model
}

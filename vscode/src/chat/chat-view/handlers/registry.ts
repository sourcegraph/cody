import { ChatHandler } from './ChatHandler'
import { ContextAgentHandler } from './ContextAgentHandler'
import type { AgentHandler, AgentTools } from './interfaces'

const agentRegister = new Map<string, (id: string, tools: AgentTools) => AgentHandler>()

export const registerAgent = (id: string, ctr: (id: string, tools: AgentTools) => AgentHandler) =>
    agentRegister.set(id, ctr)

export function getAgent(id: string, tools: AgentTools): AgentHandler {
    if (!agentRegister.has(id)) {
        // If id is not found, assume it's a base model
        const { contextRetriever, editor, chatClient } = tools
        return new ChatHandler(id, contextRetriever, editor, chatClient)
    }
    return agentRegister.get(id)!(id, tools)
}

registerAgent(
    'sourcegraph::2023-06-01::deep-cody',
    (id: string, { contextRetriever, editor, chatClient, codyToolProvider }: AgentTools) =>
        new ContextAgentHandler(id, contextRetriever, editor, chatClient, codyToolProvider)
)

import { type AgentHandler, type AgentTools, ChatHandler } from './interfaces'

const agentRegister = new Map<string, AgentHandler>()

export const registerAgent = (id: string, handler: AgentHandler) => agentRegister.set(id, handler)

export function getAgent(
    id: string,
    { contextRetriever, editor, chatClient }: AgentTools
): AgentHandler {
    if (!agentRegister.has(id)) {
        // If id is not found, assume it's a base model
        return new ChatHandler(id, contextRetriever, editor, chatClient)
    }
    return agentRegister.get(id)!
}

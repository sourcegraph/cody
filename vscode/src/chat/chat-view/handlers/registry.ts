import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage, ChatModel } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID, ToolCodyModelRef } from '@sourcegraph/cody-shared/src/models/client'
import { getConfiguration } from '../../../configuration'
import { AgenticHandler } from './AgenticHandler'
import { ChatHandler } from './ChatHandler'
import { DeepCodyHandler } from './DeepCodyHandler'
import { EditHandler } from './EditHandler'
import { SearchHandler } from './SearchHandler'
import { ExperimentalToolHandler } from './ToolHandler'
import type { AgentHandler, AgentTools } from './interfaces'

/**
 * The agentRegistry maps agent IDs to their handler factory functions
 */
const agentRegistry = new Map<string, (id: string, tools: AgentTools) => AgentHandler>([
    ['search', (_id, _tools) => new SearchHandler()],
    ['edit', (_id, { contextRetriever, editor }) => new EditHandler('edit', contextRetriever, editor)],
    [
        'insert',
        (_id, { contextRetriever, editor }) => new EditHandler('insert', contextRetriever, editor),
    ],
    [
        ToolCodyModelRef,
        (_id, _tools) => {
            const config = getConfiguration()
            return new ExperimentalToolHandler(
                new Anthropic({
                    apiKey: config.experimentalMinionAnthropicKey,
                })
            )
        },
    ],
    [
        DeepCodyAgentID,
        (_id, { contextRetriever, editor, chatClient }) =>
            new DeepCodyHandler(contextRetriever, editor, chatClient),
    ],
])

/**
 * Gets an agent handler for the specified agent and model ID
 */
export function getAgent(model: string, intent: ChatMessage['intent'], tools: AgentTools): AgentHandler {
    const { contextRetriever, editor, chatClient } = tools

    // Special case for agentic intent
    if (intent === 'agentic') {
        return new AgenticHandler(contextRetriever, editor, chatClient)
    }

    // Return appropriate handler or fallback to chat handler
    const intentHandler = intent && agentRegistry.get(intent)
    if (intentHandler) return intentHandler(intent, tools)

    // Try to get handler from registry based on model or intent
    const modelHandler = agentRegistry.get(model)
    if (modelHandler) return modelHandler(model, tools)

    return new ChatHandler(contextRetriever, editor, chatClient)
}

/**
 * Gets the agent name based on the intent and model
 * @param intent The intent of the chat message
 * @param model The model of the chat message
 * @returns The agent name or undefined if not applicable
 */
export function getAgentName(intent: ChatMessage['intent'], model?: ChatModel): string | undefined {
    // Special case for agentic intent
    if (intent === 'agentic') {
        return 'agent-mode'
    }
    if (model === ToolCodyModelRef) {
        return ToolCodyModelRef
    }
    if (model === DeepCodyAgentID) {
        return DeepCodyAgentID
    }
    return undefined
}

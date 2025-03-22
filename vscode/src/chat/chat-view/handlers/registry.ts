import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessage } from '@sourcegraph/cody-shared'
import {
    DeepCodyAgentID,
    DeepCodyModelRef,
    ToolCodyModelRef,
} from '@sourcegraph/cody-shared/src/models/client'
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
export function getAgent(model: string, agentName: string, tools: AgentTools): AgentHandler {
    const { contextRetriever, editor, chatClient } = tools
    if (agentName === 'agentic') {
        return new AgenticHandler(contextRetriever, editor, chatClient)
    }

    // Use registered agent or fall back to basic chat handler
    const handlerFactory = agentRegistry.get(model) ?? agentRegistry.get(agentName)
    if (handlerFactory) {
        return handlerFactory(agentName, tools)
    }

    // Default to basic chat handler for unknown agents
    return new ChatHandler(contextRetriever, editor, chatClient)
}

export function getAgentName(intent: ChatMessage['intent'], model?: string): string | undefined {
    if (model === DeepCodyModelRef) {
        return DeepCodyAgentID
    }
    return (intent !== 'chat' && intent) || undefined
}

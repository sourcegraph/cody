import Anthropic from '@anthropic-ai/sdk'
import {
    AgenticChatVersion,
    DeepCodyAgentID,
    ToolCodyModelRef,
} from '@sourcegraph/cody-shared/src/models/client'
import * as vscode from 'vscode'
import { getConfiguration } from '../../../configuration'
import { AgenticAnthropicHandler } from './AgenticAnthropicHandler'
import { AgenticGeminiHandler } from './AgenticGeminiHandler'
import { AgenticHandler } from './AgenticHandler'
import { ChatHandler } from './ChatHandler'
import { DeepCodyHandler } from './DeepCodyHandler'
import { EditHandler } from './EditHandler'
import { SearchHandler } from './SearchHandler'
import { ExperimentalToolHandler } from './ToolHandler'
import type { AgentHandler, AgentTools } from './interfaces'

/**
 * The AGENT_REGISTRY maps agent IDs to their handler factory functions
 */
const AGENT_REGISTRY = new Map<string, (id: string, tools: AgentTools) => AgentHandler>([
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
])

/**
 * Gets an agent handler for the specified agent and model ID
 */
export function getAgent(agent: string, modelId: string, tools: AgentTools): AgentHandler {
    // First check prototype agents
    const prototypeAgent = getAgentPrototype(agent, modelId, tools)
    if (prototypeAgent) {
        return prototypeAgent
    }

    // Use registered agent or fall back to basic chat handler
    const handlerFactory = AGENT_REGISTRY.get(agent)
    if (handlerFactory) {
        return handlerFactory(agent, tools)
    }

    // Default to basic chat handler for unknown agents
    const { contextRetriever, editor, chatClient } = tools
    return new ChatHandler(contextRetriever, editor, chatClient)
}

/**
 * Handles WIP prototype agents
 */
function getAgentPrototype(agent: string, modelId: string, tools: AgentTools): AgentHandler | undefined {
    const { contextRetriever, editor, chatClient } = tools

    // Handle Deep Cody agent
    if (agent === DeepCodyAgentID) {
        return new DeepCodyHandler(contextRetriever, editor, chatClient)
    }

    if (agent !== 'agentic') {
        return undefined
    }

    // Handle agentic models
    const config = getConfiguration()
    const isAgenticModel = modelId.includes(AgenticChatVersion)

    // Check for Anthropic models
    if (isAgenticModel && modelId.startsWith('anthropic')) {
        const apiKey = config?.devModels?.find(m => m.provider.includes('anthropic'))?.apiKey
        if (apiKey) {
            return new AgenticAnthropicHandler(contextRetriever, editor, chatClient, apiKey)
        }
        showMissionkeyError()
    }

    // Check for Gemini models
    if (isAgenticModel && modelId.startsWith('google')) {
        const apiKey = config?.devModels?.find(m => m.provider.includes('google'))?.apiKey
        if (apiKey) {
            return new AgenticGeminiHandler(contextRetriever, editor, chatClient, apiKey)
        }
        showMissionkeyError()
    }

    // Default to gateway handler for other agentic requests
    return new AgenticHandler(contextRetriever, editor, chatClient)
}

function showMissionkeyError(): void {
    vscode.window.showErrorMessage('No API key found. Falling back to gateway handler.')
}

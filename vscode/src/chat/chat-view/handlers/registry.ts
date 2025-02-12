import Anthropic from '@anthropic-ai/sdk'
import { DeepCodyAgentID, ToolCodyModelRef } from '@sourcegraph/cody-shared/src/models/client'
import { getConfiguration } from '../../../configuration'
import { ChatHandler } from './ChatHandler'
import { DeepCodyHandler } from './DeepCodyHandler'
import { EditHandler } from './EditHandler'
import { SearchHandler } from './SearchHandler'
import { ExperimentalToolHandler } from './ToolHandler'
import type { AgentTools, OmniboxHandler } from './interfaces'

/**
 * The handlerRegistry registers omnibox handlers under IDs which can then be invoked
 * at query time to retrieve the appropriate handler for a user request.
 */
const handlerRegistry = new Map<string, (id: string, tools: AgentTools) => OmniboxHandler>()

function registerHandler(id: string, ctr: (id: string, tools: AgentTools) => OmniboxHandler) {
    handlerRegistry.set(id, ctr)
}

export function getHandler(id: string, modelId: string, tools: AgentTools): OmniboxHandler {
    const { contextRetriever, editor, chatClient } = tools
    if (id === DeepCodyAgentID) {
        return new DeepCodyHandler(modelId, contextRetriever, editor, chatClient)
    }
    if (handlerRegistry.has(id)) {
        return handlerRegistry.get(id)!(id, tools)
    }
    // If id is not found, assume it's a base model
    return new ChatHandler(modelId, contextRetriever, editor, chatClient)
}

registerHandler('search', (_id: string, _tools: AgentTools) => new SearchHandler())
registerHandler(
    'edit',
    (_id: string, { contextRetriever, editor }: AgentTools) =>
        new EditHandler('edit', contextRetriever, editor)
)
registerHandler(
    'insert',
    (_id: string, { contextRetriever, editor }: AgentTools) =>
        new EditHandler('insert', contextRetriever, editor)
)
registerHandler(ToolCodyModelRef, (_id: string) => {
    const config = getConfiguration()
    const anthropicAPI = new Anthropic({
        apiKey: config.experimentalMinionAnthropicKey,
    })
    return new ExperimentalToolHandler(anthropicAPI)
})

import type { ChatNetworkClient, ChatNetworkClientParams } from '.'
import { ModelUIGroup, googleChatClient, groqChatClient, ollamaChatClient } from '..'
import { type Model, ModelsService } from '../models'
import { anthropicChatClient } from './anthropic/chat-client'

export async function useCustomChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<boolean> {
    const model = ModelsService.getModelByID(params.model ?? '')
    if (!model || isCodyGatewayModel(model)) {
        return false
    }

    const clientMap: Record<string, ChatNetworkClient> = {
        anthropic: anthropicChatClient,
        ollama: ollamaChatClient,
        google: googleChatClient,
        groq: groqChatClient,
        openaicompatible: groqChatClient,
    }

    const client = clientMap[model.provider.toLowerCase()]

    if (client) {
        await client({ params, cb, completionsEndpoint, logger, signal })
        return true
    }

    return false
}

function isCodyGatewayModel(model: Model): boolean {
    // Google models with a UI group are Cody Gateway models.
    // TODO (bee) Add new labels to make identifying Cody Gateway models easier.
    return model.uiGroup !== undefined && model.uiGroup !== ModelUIGroup.Ollama
}

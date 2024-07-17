import type { ChatNetworkClient, ChatNetworkClientParams } from '.'
import { googleChatClient, groqChatClient, ollamaChatClient } from '..'
import { ModelsService } from '../models'
import { isCustomModel } from '../models/utils'
import { anthropicChatClient } from './anthropic/chat-client'

export async function useCustomChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<boolean> {
    const model = ModelsService.getModelByID(params.model ?? '')
    if (!model || !isCustomModel(model)) {
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

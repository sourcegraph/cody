import type { ChatNetworkClient, ChatNetworkClientParams } from '.'
import { googleChatClient, groqChatClient, ollamaChatClient } from '..'
import { modelsService } from '../models/modelsService'
import { isCustomModel } from '../models/utils'
import { anthropicChatClient } from './anthropic/chat-client'
import { llmChatClient } from './openai-compatible/chat-client'
import { openaiChatClient } from './openai/chat-client'

export async function useCustomChatClient({
    params,
    cb,
    completionsEndpoint,
    logger,
    signal,
}: ChatNetworkClientParams): Promise<boolean> {
    const model = modelsService.getModelByID(params.model ?? '')
    if (!model || !isCustomModel(model)) {
        return false
    }

    const clientMap: Record<string, ChatNetworkClient> = {
        anthropic: anthropicChatClient,
        ollama: ollamaChatClient,
        google: googleChatClient,
        gemini: googleChatClient,
        groq: groqChatClient,
        openaicompatible: openaiChatClient,
        grok: llmChatClient,
    }

    const client = clientMap[model.provider.toLowerCase()]

    if (client) {
        await client({ params, cb, completionsEndpoint, logger, signal })
        return true
    }

    return false
}

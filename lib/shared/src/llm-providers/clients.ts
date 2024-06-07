import { ModelUIGroup, googleChatClient, groqChatClient, ollamaChatClient } from '..'
import { type Model, ModelsService } from '../models'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type { CompletionCallbacks, CompletionParameters } from '../sourcegraph-api/completions/types'

export async function useCustomChatClient(
    completionsEndpoint: string,
    params: CompletionParameters,
    cb: CompletionCallbacks,
    logger?: CompletionLogger,
    signal?: AbortSignal
): Promise<boolean> {
    const model = ModelsService.getModelByID(params.model ?? '')
    if (!model || isCodyGatewayModel(model)) {
        return false
    }

    const clientMap: Record<
        string,
        (
            params: CompletionParameters,
            cb: CompletionCallbacks,
            completionsEndpoint: string,
            logger?: CompletionLogger,
            signal?: AbortSignal
        ) => Promise<void>
    > = {
        ollama: ollamaChatClient,
        google: googleChatClient,
        groq: groqChatClient,
        openaicompatible: groqChatClient,
    }

    const client = clientMap[model.provider]

    if (client) {
        await client(params, cb, completionsEndpoint, logger, signal)
        return true
    }

    return false
}

function isCodyGatewayModel(model: Model): boolean {
    // Google models with a UI group are Cody Gateway models.
    // TODO (bee) Add new labels to make identifying Cody Gateway models easier.
    return model.uiGroup !== undefined && model.uiGroup !== ModelUIGroup.Ollama
}

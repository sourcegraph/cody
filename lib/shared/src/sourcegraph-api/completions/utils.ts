import { type SerializedChatMessage, contextFiltersProvider } from '../..'
import type { CompletionParameters, Message, SerializedCompletionParameters } from './types'

/**
 * Serializes the completion parameters by converting the message text to a filtered string using the provided context filters.
 *
 * @param params - The completion parameters to serialize.
 * @returns A serialized version of the completion parameters with the message text filtered.
 */
export async function getSerializedParams(
    params: CompletionParameters
): Promise<SerializedCompletionParameters> {
    return {
        ...params,
        messages: await serializePrompts(params.messages, params.model),
    }
}

async function serializePrompts(
    messages: Message[],
    modelID?: string
): Promise<SerializedChatMessage[]> {
    // NOTE: Some models do not support empty assistant message at the end.
    if (modelID?.startsWith('google/') && messages.at(-1)?.speaker === 'assistant') {
        messages.pop()
    }

    return Promise.all(
        messages.map(async m => ({
            ...m,
            text: await m.text?.toFilteredString(contextFiltersProvider.instance!),
        }))
    )
}

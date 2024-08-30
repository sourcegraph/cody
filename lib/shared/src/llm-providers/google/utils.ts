import type { GeminiChatMessage } from '.'
import { contextFiltersProvider } from '../../cody-ignore/context-filters-provider'
import type { Message } from '../../sourcegraph-api'

/**
 * Constructs an array of `GeminiChatMessage` objects from an array of `Message` objects.
 *
 * Each `GeminiChatMessage` object has a `role` property set to either `'user'` or `'model'` based on the `speaker` property of the
 * corresponding `Message` object, and a `parts` property containing an array with a single `{ text: string }` object, where the
 * `text` property is set to the `text` property of the corresponding `Message` object.
 *
 * The resulting array of `GeminiChatMessage` objects excludes the last `GeminiChatMessage` object if its `role` is `'model'`.
 *
 * @param messages - An array of `Message` objects to be converted to `GeminiChatMessage` objects.
 * @returns An array of `GeminiChatMessage` objects.
 */
export async function constructGeminiChatMessages(messages: Message[]): Promise<GeminiChatMessage[]> {
    return (
        await Promise.all(
            messages.map(async msg => ({
                role: msg.speaker === 'human' ? 'user' : 'model',
                parts: [
                    { text: (await msg.text?.toFilteredString(contextFiltersProvider.instance!)) ?? '' },
                ],
            }))
        )
    ).filter((_, i, arr) => i !== arr.length - 1 || arr[i].role !== 'model')
}

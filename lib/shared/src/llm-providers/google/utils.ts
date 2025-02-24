import type {
    Content,
    GenerativeContentBlob,
    InlineDataPart,
    Part,
    TextPart,
} from '@google/generative-ai'
import type { Message } from '../..'

/**
 * Constructs the messages array for the Gemini API, including handling InlineDataPart for media.
 */
export async function constructGeminiChatMessages(messages: Message[]): Promise<Content[]> {
    // Use 'any[]' temporarily for Content[]

    return messages.map(message => {
        let role: 'user' | 'model' | 'system' // Gemini API roles

        switch (message.speaker) {
            case 'human':
                role = 'user'
                break
            case 'assistant':
                role = 'model'
                break
            case 'system':
                role = 'system'
                break
            default:
                role = 'user'
        }

        let part: Part
        if (message.data && message.mimeType) {
            const inlineData: GenerativeContentBlob = {
                mimeType: message.mimeType,
                data: message.data,
            }
            part = { inlineData } satisfies InlineDataPart // Keep satisfies for now
        } else {
            const text = message.text?.toString() || ''
            part = { text } satisfies TextPart // Keep satisfies for now
        }

        return {
            role,
            parts: [part],
        } satisfies Content // Keep satisfies for now
    })
}

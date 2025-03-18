import type { Content, InlineDataPart, Part } from '@google/generative-ai'
import type { Message } from '../..'
import { getMessageImageUrl } from '../completions-converter'

/**
 * Constructs the messages array for the Gemini API, including handling InlineDataPart for media.
 */
export async function constructGeminiChatMessages(messages: Message[]): Promise<Content[]> {
    const contents: Content[] = []

    // Map speaker types to Gemini API roles
    const roleMap: Record<string, 'user' | 'model' | 'system'> = {
        human: 'user',
        assistant: 'model',
        system: 'system',
    }

    for (const message of messages) {
        const role = roleMap[message.speaker] || 'user'
        const parts: Part[] = []

        // Skip if this would create consecutive messages from the same role
        const lastContent = contents[contents.length - 1]
        if (lastContent?.role === role) {
            continue
        }

        // Process message content parts
        if (message.content?.length) {
            for (const part of message.content) {
                if (part.type === 'text' && part.text?.length) {
                    parts.push({ text: part.text })
                }
                const { data, mimeType } = getMessageImageUrl(part)
                if (data && mimeType) {
                    parts.push({
                        inlineData: { mimeType, data: data.replace(/data:[^;]+;base64,/, '') },
                    } satisfies InlineDataPart)
                }
            }
        }

        // Add message text if present
        if (message.text?.length) {
            parts.push({ text: message.text.toString() })
        }

        // Add content if there are parts
        if (parts.length > 0) {
            contents.push({ role, parts })
        }
    }

    // Remove trailing model message if present
    if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
        contents.pop()
    }

    return contents
}

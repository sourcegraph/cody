import type { Content, InlineDataPart, Part } from '@google/generative-ai'
import type { Message } from '../..'

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
                if (part.type === 'image_url' && part.image_url?.url) {
                    let data = part.image_url?.url
                    if (data.startsWith('data:')) {
                        data = part.image_url?.url
                    }
                    parts.push({
                        inlineData: { mimeType: 'image/png', data },
                    } satisfies InlineDataPart)
                }
                // TODO (bee) add support for function calls
                // if (part.type === 'tool') {
                //     parts.push({
                //         functionCall: { name: part.name, args: part.args },
                //     } satisfies FunctionCallPart)
                // }
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

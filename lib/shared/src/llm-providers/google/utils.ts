import type { Content, InlineDataPart, Part } from '@google/generative-ai'
import type { Message } from '../..'

/**
 * Constructs the messages array for the Gemini API, including handling InlineDataPart for media.
 */
export async function constructGeminiChatMessages(messages: Message[]): Promise<Content[]> {
    const contents: Content[] = []
    let imageParts: InlineDataPart[] = []

    // Map speaker types to Gemini API roles
    const roleMap: Record<string, 'user' | 'model' | 'system'> = {
        human: 'user',
        assistant: 'model',
        system: 'system',
    }

    for (const message of messages) {
        const role = roleMap[message.speaker] || 'user'

        // Handle image data
        if (message.data && message.mimeType && role === 'user') {
            const data = message.data.replace(/data:[^;]+;base64,/, '')
            imageParts.push({
                inlineData: { mimeType: message.mimeType, data },
            })
            continue
        }

        // Skip consecutive messages from same role
        const lastContent = contents[contents.length - 1]
        if (
            (role === 'model' && lastContent?.role === 'model') ||
            (role === 'user' && lastContent?.role === 'user')
        ) {
            continue
        }

        const parts: Part[] = []

        // Add text part if present
        if (message.text) {
            parts.push({ text: message.text.toString() })
        }

        // Add image parts to user messages
        if (imageParts.length && role === 'user') {
            parts.push(...imageParts)
            imageParts = []
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

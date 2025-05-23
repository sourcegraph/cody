import {
    type ChatMessage,
    type MessagePart,
    type PromptString,
    type ToolCallContentPart,
    type ToolResultContentPart,
    isDefined,
    ps,
} from '@sourcegraph/cody-shared'

export function sanitizedChatMessages(messages: ChatMessage[]): any[] {
    if (!messages.length) {
        return []
    }

    // Find the first human message index for <think> tag processing

    // Create a helper to remove <think> tags from text that starts with them
    const removeThinkTags = (text: PromptString | undefined): PromptString => {
        if (!text) return ps``
        const textString = text.toString()?.trim()
        return textString.startsWith('<think>') ? text.replace(/<think>.*?<\/think>/, ps``) : text
    }

    // Process messages
    return messages.map((message, messageIndex) => {
        const processedMessage = { ...message }

        // Handle messages with only text property (no content array)
        if (!message.content) {
            if (message.text) {
                const processedText = removeThinkTags(message.text)
                if (processedText?.toString() !== message.text?.toString()) {
                    return {
                        ...processedMessage,
                        text: processedText,
                    }
                }
            }
            return processedMessage
        }

        // Handle messages with content array
        const contentParts: MessagePart[] = []

        // Add text content if present and not already in content
        if (message.text?.toString()) {
            const processedText = removeThinkTags(message.text)
            const processedTextString = processedText.toString()

            // Check if this processed text already exists in content
            // This prevents duplicates when the function is called multiple times
            const textAlreadyInContent = message.content.some(
                part => part.type === 'text' && part.text === processedTextString
            )

            if (processedTextString && !textAlreadyInContent) {
                contentParts.push({ type: 'text', text: processedTextString })
            }
        }

        // Add existing content parts (but avoid duplicating text parts)
        for (const part of message.content) {
            // Skip text parts that match the text we just added
            if (
                part.type === 'text' &&
                contentParts.some(p => p.type === 'text' && p.text === part.text)
            ) {
                continue
            }
            contentParts.push(part)
        }

        // Sanitize content parts
        let sanitizedContent = contentParts
            .map(part => sanitizeContentPart(part, message.speaker))
            .filter(isDefined)
            .filter(part => !(part.type === 'text' && !part.text)) // Remove empty text parts

        // Check ALL assistant messages for orphaned tool calls
        if (message.speaker === 'assistant') {
            const nextMessage = messages[messageIndex + 1]
            const hasToolCall = sanitizedContent.some(part => part.type === 'tool_call')

            if (hasToolCall) {
                // Check if next message is human and has corresponding tool results
                if (!nextMessage || nextMessage.speaker !== 'human') {
                    // No human message follows, remove tool calls
                    sanitizedContent = sanitizedContent.filter(part => part.type !== 'tool_call')
                } else {
                    // Check if all tool calls have corresponding results
                    const toolCallIds = sanitizedContent
                        .filter(part => part.type === 'tool_call')
                        .map(part => (part as ToolCallContentPart).tool_call?.id)
                        .filter(isDefined)

                    const nextMessageParts = normalizeContent(nextMessage)
                    const toolResultIds = nextMessageParts
                        .filter(part => part.type === 'tool_result')
                        .map(part => (part as ToolResultContentPart).tool_result?.id)
                        .filter(isDefined)

                    // If any tool call doesn't have a corresponding result, remove all tool calls
                    const hasOrphanedToolCall = toolCallIds.some(id => !toolResultIds.includes(id))
                    if (hasOrphanedToolCall) {
                        sanitizedContent = sanitizedContent.filter(part => part.type !== 'tool_call')
                    }
                }
            }
        }

        return {
            ...processedMessage,
            content: sanitizedContent,
            text: removeThinkTags(message.text),
        }
    })
}

function sanitizeContentPart(
    part: MessagePart,
    speaker: 'human' | 'assistant' | 'system'
): MessagePart | undefined {
    switch (part.type) {
        case 'text':
            {
                const text = part.text?.toString()
                if (text?.startsWith('<think>') && text.includes('</think>')) {
                    const sanitized = text.replace(/<think>.*?<\/think>/, '')
                    return sanitized ? { ...part, text: sanitized } : undefined
                }
            }
            return part

        case 'tool_call':
            // Tool calls are only allowed in assistant messages
            return speaker === 'assistant' ? sanitizeToolCall(part as ToolCallContentPart) : undefined

        case 'tool_result':
            // Tool results are only allowed in human messages
            return speaker === 'human' ? sanitizeToolResult(part as ToolResultContentPart) : undefined

        default:
            return part
    }
}

function normalizeContent(message: ChatMessage): MessagePart[] {
    const parts: MessagePart[] = []
    if (message.text?.toString()) {
        parts.push({ type: 'text', text: message.text.toString() })
    }
    if (message.content) {
        parts.push(...message.content)
    }
    return parts
}

function sanitizeToolCall(toolCall: ToolCallContentPart): ToolCallContentPart | undefined {
    if (!toolCall.tool_call) {
        return undefined
    }
    return {
        type: 'tool_call',
        tool_call: {
            id: toolCall.tool_call.id,
            name: toolCall.tool_call.name,
            arguments: toolCall.tool_call.arguments,
        },
    }
}

function sanitizeToolResult(toolResult: ToolResultContentPart): ToolResultContentPart | undefined {
    if (!toolResult.tool_result?.id) {
        return undefined
    }
    return {
        type: 'tool_result',
        tool_result: {
            id: toolResult.tool_result.id,
            content: toolResult.tool_result.content ?? 'Empty',
        },
    }
}

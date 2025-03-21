import {
    type ChatMessage,
    type ToolCallContentPart,
    type ToolResultContentPart,
    isDefined,
} from '@sourcegraph/cody-shared'

export function sanitizedChatMessages(messages: ChatMessage[]): any[] {
    return messages.map(message => {
        if (message.content) {
            const sanitizedContent = message.content
                .map(part => {
                    if (part.type === 'tool_call') {
                        // Removes tool calls from the human
                        if (message.speaker !== 'assistant') {
                            return undefined
                        }
                        return sanitizeToolCall(part as ToolCallContentPart)
                    }
                    if (part.type === 'tool_result') {
                        // Removes tool results from the assistant
                        if (message.speaker === 'assistant') {
                            return undefined
                        }
                        return sanitizeToolResult(part as ToolResultContentPart)
                    }
                    if (part.type === 'text') {
                        message.text = undefined
                    }
                    return part
                })
                .filter(isDefined)
                // Filter out empty text parts
                .filter(part => !(part.type === 'text' && part.text === ''))

            return {
                ...message,
                content: sanitizedContent,
            }
        }
        return message
    })
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

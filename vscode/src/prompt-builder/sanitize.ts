import type { ChatMessage, ToolCallContentPart, ToolResultContentPart } from '@sourcegraph/cody-shared'

export function sanitizedChatMessages(messages: ChatMessage[]): any[] {
    return messages.map(message => {
        if (message.content) {
            const sanitizedContent = message.content
                .map(part => {
                    if (part.type === 'tool_call') {
                        return sanitizeToolCall(part as ToolCallContentPart)
                    }
                    if (part.type === 'tool_result') {
                        return sanitizeToolResult(part as ToolResultContentPart)
                    }
                    if (part.type === 'text') {
                        message.text = undefined
                    }
                    return part
                })
                .filter(part => !(part.type === 'text' && part.text === '')) // Filter out empty text parts

            return {
                ...message,
                content: sanitizedContent,
            }
        }
        return message
    })
}

function sanitizeToolCall(toolCall: ToolCallContentPart): ToolCallContentPart {
    return {
        type: 'tool_call',
        tool_call: {
            id: toolCall.tool_call.id,
            name: toolCall.tool_call.name,
            arguments: toolCall.tool_call.arguments,
        },
    }
}

function sanitizeToolResult(toolResult: ToolResultContentPart): ToolResultContentPart {
    return {
        type: 'tool_result',
        tool_result: {
            id: toolResult.tool_result.id,
            content: toolResult.tool_result.content,
        },
    }
}

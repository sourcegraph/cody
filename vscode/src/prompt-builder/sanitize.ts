import {
    type ChatMessage,
    type ToolCallContentPart,
    type ToolResultContentPart,
    isDefined,
} from '@sourcegraph/cody-shared'

export function sanitizedChatMessages(messages: ChatMessage[]): any[] {
    // Check if the last assistant message has a tool_call and the current human message doesn't have a tool_result
    const processedMessages = [...messages] // Create a copy to avoid mutating the original array

    // Process the first human message to remove content between <think> tags
    const firstHumanIndex = processedMessages.findIndex(m => m.speaker === 'human');
    if (firstHumanIndex >= 0) {
        const firstHumanMessage = processedMessages[firstHumanIndex];
        if (firstHumanMessage.content) {
            // Check if any text part contains <think> tags
            const hasThinkTags = firstHumanMessage.content.some(
                part => part.type === 'text' && 
                typeof part.text === 'string' && 
                part.text.includes('<think>') && 
                part.text.includes('</think>')
            );
            
            if (hasThinkTags) {
                // Process text parts to remove content between <think> tags
                firstHumanMessage.content = firstHumanMessage.content.map(part => {
                    if (part.type === 'text' && typeof part.text === 'string') {
                        // Remove content between <think> and </think> tags
                        const text = part.text.replace(/<think>[\s\S]*?<\/think>/g, '');
                        return { ...part, text };
                    }
                    return part;
                });
            }
        }
    }

    // Find the last assistant message index
    const lastAssistantIndex = processedMessages.map(m => m.speaker).lastIndexOf('assistant')

    // Check if there's a human message after the last assistant message
    if (lastAssistantIndex >= 0 && lastAssistantIndex < processedMessages.length - 1) {
        const lastAssistantMessage = processedMessages[lastAssistantIndex]
        const nextHumanMessage = processedMessages[lastAssistantIndex + 1]

        // Check if the last assistant message has a tool_call
        const hasToolCall = lastAssistantMessage.content?.some(part => part.type === 'tool_call')

        // Check if the next human message has a tool_result
        const hasToolResult = nextHumanMessage.content?.some(part => part.type === 'tool_result')

        // If the assistant has a tool_call but the human doesn't have a tool_result, remove the tool_call
        if (hasToolCall && !hasToolResult && lastAssistantMessage.content) {
            lastAssistantMessage.content = lastAssistantMessage.content
                .map(part => (part.type === 'tool_call' ? undefined : part))
                .filter(isDefined)
        }
    }

    return processedMessages.map(message => {
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

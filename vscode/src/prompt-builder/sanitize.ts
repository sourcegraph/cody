import {
    type ChatMessage,
    type ToolCallContentPart,
    type ToolResultContentPart,
    isDefined,
    ps,
} from '@sourcegraph/cody-shared'

export function sanitizedChatMessages(messages: ChatMessage[]): any[] {
    const processedMessages = [...messages] // Create a copy to avoid mutating the original array

    // Process all human messages to remove content between <think> tags
    for (const message of processedMessages) {
        if (message.speaker === 'human') {
            const text = message.text?.toString()
            // Check if text starts with <think> tags and contains close tag
            if (text?.startsWith('<think>') && text?.includes('</think>')) {
                // Process text parts to remove content between <think> tags, including the tags.
                // Only remove the content from the first pair.
                message.text = message.text?.replace(/<think>.*?<\/think>/, ps``)
            }
        }
    }

    // Process all assistant messages for tool call removal
    for (let i = 0; i < processedMessages.length; i++) {
        const message = processedMessages[i]
        if (message.speaker === 'assistant' && message.content) {
            const toolCalls = message.content.filter(
                part => part.type === 'tool_call'
            ) as ToolCallContentPart[]

            if (toolCalls.length > 0) {
                const nextMessage = processedMessages[i + 1]
                let shouldRemoveToolCalls = false

                // Remove tool calls if:
                // 1. There's no next message
                // 2. Next message is not human
                // 3. Next human message doesn't have corresponding tool_results for ALL tool calls
                if (!nextMessage || nextMessage.speaker !== 'human') {
                    shouldRemoveToolCalls = true
                } else {
                    const toolResults =
                        (nextMessage.content?.filter(
                            part => part.type === 'tool_result'
                        ) as ToolResultContentPart[]) || []
                    const toolResultIds = new Set(toolResults.map(result => result.tool_result?.id))

                    // Check if all tool calls have corresponding results
                    const allToolCallsHaveResults = toolCalls.every(call =>
                        toolResultIds.has(call.tool_call?.id)
                    )

                    if (!allToolCallsHaveResults) {
                        shouldRemoveToolCalls = true
                    }
                }

                if (shouldRemoveToolCalls) {
                    message.content = message.content
                        .map(part => (part.type === 'tool_call' ? undefined : part))
                        .filter(isDefined)
                }
            }
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
                    return part
                })
                .filter(isDefined)
                // Filter out empty text parts
                .filter(part => !(part.type === 'text' && (part.text === '' || part.text === undefined)))

            // Only add text from message.text if it exists and isn't already in content
            const messageText = message.text?.toString()
            if (
                messageText &&
                !sanitizedContent.some(part => part.type === 'text' && part.text === messageText)
            ) {
                sanitizedContent.unshift({ type: 'text', text: messageText })
            }

            return {
                ...message,
                content: sanitizedContent,
                text: undefined,
            }
        }
        return message
    })
}
function sanitizeToolCall(toolCall: ToolCallContentPart): ToolCallContentPart | undefined {
    if (!toolCall.tool_call?.id || !toolCall.tool_call?.name || !toolCall.tool_call?.arguments) {
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

import type { Content, InlineDataPart, Part } from '@google/generative-ai'
import type { Message } from '../..'
import { logDebug } from '../..'
import { getMessageImageUrl } from '../completions-converter'

/**
 * Result of constructing Gemini chat messages, including system instructions
 */
export interface GeminiChatMessagesResult {
    contents: Content[]
    systemInstruction?: { parts: Part[] }
}

/**
 * Constructs the messages array for the Gemini API, including handling InlineDataPart for media.
 * Extracts system messages as systemInstruction for Google's API format.
 */
export async function constructGeminiChatMessages(
    messages: Message[]
): Promise<GeminiChatMessagesResult> {
    const contents: Content[] = []
    let systemInstruction: { parts: Part[] } | undefined

    // Map speaker types to Gemini API roles
    const roleMap: Record<string, 'user' | 'model' | 'system'> = {
        human: 'user',
        assistant: 'model',
        system: 'system',
    }

    // First, extract any system messages
    const messagesToProcess = [...messages]
    for (let i = 0; i < messagesToProcess.length; i++) {
        const message = messagesToProcess[i]
        if (message.speaker === 'system') {
            const parts: Part[] = []

            // Process system message content
            if (message.content?.length) {
                for (const part of message.content) {
                    if (part.type === 'text' && part.text?.length) {
                        parts.push({ text: part.text })
                    }
                }
            }

            // Add message text if present
            if (message.text?.length) {
                parts.push({ text: message.text.toString() })
            }

            if (parts.length > 0) {
                systemInstruction = { parts }
                logDebug('GoogleChatClient', 'Extracted system instruction', {
                    verbose: systemInstruction,
                })
            }

            // Remove this system message from further processing
            messagesToProcess.splice(i, 1)
            i--
        }
    }

    // Then process the remaining messages
    for (const message of messagesToProcess) {
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
                } else if (part.type === 'tool_call' && part.tool_call) {
                    logDebug('GoogleChatClient', 'Converting tool_call to functionCall', {
                        verbose: part,
                    })

                    try {
                        const args = part.tool_call.arguments ? JSON.parse(part.tool_call.arguments) : {}

                        parts.push({
                            functionCall: {
                                name: part.tool_call.name,
                                args,
                            },
                        })

                        logDebug('GoogleChatClient', 'Converted to functionCall format', {
                            verbose: parts[parts.length - 1],
                        })
                    } catch (e) {
                        logDebug('GoogleChatClient', `Error parsing tool call arguments: ${e}`, {
                            verbose: part.tool_call,
                        })

                        parts.push({
                            functionCall: {
                                name: part.tool_call.name,
                                args:
                                    typeof part.tool_call.arguments === 'string'
                                        ? {}
                                        : part.tool_call.arguments || {},
                            },
                        })
                    }
                } else if (part.type === 'tool_result' && part.tool_result) {
                    logDebug('GoogleChatClient', 'Converting tool_result to functionResponse', {
                        verbose: part,
                    })

                    parts.push({
                        functionResponse: {
                            name: part.tool_result.id || '',
                            response: {
                                name: part.tool_result.id || '',
                                content: part.tool_result.content,
                            },
                        },
                    })

                    logDebug('GoogleChatClient', 'Converted to functionResponse format', {
                        verbose: parts[parts.length - 1],
                    })
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

    // If there are no user messages, add an empty one to satisfy Google's requirement
    // that the first message must be from a user
    if (contents.length === 0 || contents[0].role !== 'user') {
        contents.unshift({ role: 'user', parts: [{ text: ' ' }] })
    }

    return { contents, systemInstruction }
}

/**
 * Converts tool definitions to Google's functionDeclarations format
 */
export function formatGoogleFunctionDeclarations(tools: any[]): any[] {
    if (!tools || !tools.length) {
        return []
    }

    return tools
        .map(tool => {
            if (tool.type !== 'function' || !tool.function) {
                return null
            }

            return {
                name: tool.function.name,
                description: tool.function.description || '',
                parameters: formatGoogleParameters(tool.function.parameters),
            }
        })
        .filter(Boolean)
}

/**
 * Converts JSON Schema parameters to Google's parameter format
 */
function formatGoogleParameters(parameters: any): any {
    if (!parameters) {
        return { type: 'OBJECT', properties: {} }
    }

    // Convert JSON schema types to Google API types
    const typeMap: Record<string, string> = {
        string: 'STRING',
        number: 'NUMBER',
        integer: 'NUMBER',
        boolean: 'BOOLEAN',
        object: 'OBJECT',
        array: 'ARRAY',
    }

    const convertedParams: any = {
        type: typeMap[parameters.type] || 'OBJECT',
        properties: {},
    }

    // Convert properties
    if (parameters.properties) {
        for (const [key, prop] of Object.entries<any>(parameters.properties)) {
            convertedParams.properties[key] = {
                type: typeMap[prop.type] || 'STRING',
                description: prop.description || '',
            }

            // Handle enum values
            if (prop.enum) {
                convertedParams.properties[key].enum = prop.enum
            }
        }
    }

    // Add required fields
    if (parameters?.required?.length) {
        convertedParams.required = parameters.required
    }

    return convertedParams
}

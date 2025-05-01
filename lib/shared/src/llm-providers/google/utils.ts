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

    // Track the last function call name for matching responses
    let lastFunctionCallName: string | null = null

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
        let parts: Part[] = []
        let hasFunctionPart = false

        // Process message content parts
        if (message.content?.length) {
            for (let i = 0; i < message.content.length; i++) {
                const part = message.content[i]

                if (part.type === 'text' && part.text?.length) {
                    parts.push({ text: part.text })
                } else if (part.type === 'tool_call' && part.tool_call) {
                    logDebug('GoogleChatClient', 'Converting tool_call to functionCall', {
                        verbose: part,
                    })

                    try {
                        const args = part.tool_call.arguments ? JSON.parse(part.tool_call.arguments) : {}

                        // Store the function call name for matching responses
                        lastFunctionCallName = part.tool_call.name

                        // FunctionCall should also be in its own message
                        // Add any accumulated parts first
                        if (parts.length > 0) {
                            // Merge with previous message from same role if possible
                            if (
                                contents.length > 0 &&
                                contents[contents.length - 1].role === role &&
                                !hasFunctionPart
                            ) {
                                contents[contents.length - 1].parts.push(...parts)
                            } else {
                                contents.push({ role, parts: [...parts] })
                            }
                            parts = [] // Clear the parts array
                        }

                        // Add function call as a separate message
                        contents.push({
                            role,
                            parts: [
                                {
                                    functionCall: {
                                        name: part.tool_call.name,
                                        args,
                                    },
                                },
                            ],
                        })

                        hasFunctionPart = true
                        logDebug(
                            'GoogleChatClient',
                            'Converted to functionCall format as separate message'
                        )
                    } catch (e) {
                        logDebug('GoogleChatClient', `Error parsing tool call arguments: ${e}`, {
                            verbose: part.tool_call,
                        })

                        // Store the function call name for matching responses
                        lastFunctionCallName = part.tool_call.name

                        // Add any accumulated parts first
                        if (parts.length > 0) {
                            // Merge with previous message from same role if possible
                            if (
                                contents.length > 0 &&
                                contents[contents.length - 1].role === role &&
                                !hasFunctionPart
                            ) {
                                contents[contents.length - 1].parts.push(...parts)
                            } else {
                                contents.push({ role, parts: [...parts] })
                            }
                            parts = [] // Clear the parts array
                        }

                        // Add function call as a separate message
                        contents.push({
                            role,
                            parts: [
                                {
                                    functionCall: {
                                        name: part.tool_call.name,
                                        args:
                                            typeof part.tool_call.arguments === 'string'
                                                ? {}
                                                : part.tool_call.arguments || {},
                                    },
                                },
                            ],
                        })

                        hasFunctionPart = true
                        logDebug(
                            'GoogleChatClient',
                            'Converted to functionCall format as separate message after error'
                        )
                    }
                } else if (part.type === 'tool_result' && part.tool_result) {
                    logDebug('GoogleChatClient', 'Converting tool_result to functionResponse', {
                        verbose: part,
                    })

                    // Only model can send functionCall, only user can send functionResponse
                    if (role !== 'user') {
                        logDebug('GoogleChatClient', 'Skipping function response for non-user role')
                        continue
                    }

                    // FunctionResponse cannot be mixed with other part types
                    // Always add any accumulated parts first
                    if (parts.length > 0) {
                        // Merge with previous message from same role if possible
                        if (
                            contents.length > 0 &&
                            contents[contents.length - 1].role === role &&
                            !hasFunctionPart
                        ) {
                            contents[contents.length - 1].parts.push(...parts)
                        } else {
                            contents.push({ role, parts: [...parts] })
                        }
                        parts = [] // Clear the parts array
                    }

                    // Use the lastFunctionCallName for the response name to ensure matching
                    const responseName = lastFunctionCallName || part.tool_result.id || ''

                    // Always add function response as a separate message
                    contents.push({
                        role: 'user', // Function responses must come from user
                        parts: [
                            {
                                functionResponse: {
                                    name: responseName,
                                    response: {
                                        name: responseName,
                                        content: part.tool_result.content,
                                    },
                                },
                            },
                        ],
                    })

                    hasFunctionPart = true
                    logDebug(
                        'GoogleChatClient',
                        'Converted to functionResponse format as separate message'
                    )
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

        // Add content if there are parts and we haven't already processed a function part
        if (parts.length > 0 && !hasFunctionPart) {
            // Merge with previous message from same role if possible
            if (contents.length > 0 && contents[contents.length - 1].role === role) {
                contents[contents.length - 1].parts.push(...parts)
            } else {
                contents.push({ role, parts })
            }
        }
    }

    // Enforce Gemini API requirements:
    // 1. Start with a "user" role
    // 2. End with either a "user" or "function" role
    // 3. Alternate between "model" and either ("user" or "function") roles

    // First, ensure we start with a user message
    if (contents.length === 0 || contents[0].role !== 'user') {
        contents.unshift({ role: 'user', parts: [{ text: ' ' }] })
        logDebug('GoogleChatClient', 'Added empty user message at start to satisfy API requirements')
    }

    // Fix alternation issues by inserting empty messages where needed
    for (let i = 1; i < contents.length; i++) {
        const prevRole = contents[i - 1].role
        const currentRole = contents[i].role

        // If we have two consecutive user/function messages, insert an empty model message
        if (prevRole === 'user' && currentRole === 'user') {
            contents.splice(i, 0, { role: 'model', parts: [{ text: ' ' }] })
            logDebug('GoogleChatClient', 'Inserted empty model message to maintain alternation')
            i++ // Skip the newly inserted message
        }

        // If we have two consecutive model messages, insert an empty user message
        if (prevRole === 'model' && currentRole === 'model') {
            contents.splice(i, 0, { role: 'user', parts: [{ text: ' ' }] })
            logDebug('GoogleChatClient', 'Inserted empty user message to maintain alternation')
            i++ // Skip the newly inserted message
        }
    }

    // Ensure we end with a user message (not a model message)
    if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
        contents.push({ role: 'user', parts: [{ text: ' ' }] })
        logDebug('GoogleChatClient', 'Added empty user message at end to satisfy API requirements')
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
            // Skip $schema property
            if (key === '$schema') {
                continue
            }
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

    console.log('Converted parameters:', convertedParams)

    return convertedParams
}

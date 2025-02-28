import type { InlineDataPart } from '@google/generative-ai'
import type { MessagePart } from '..'
import type { Message } from '../sourcegraph-api'

// Examples of the message format for completions request for different providers:
// Sourcegraph, Anthropic, Google
// {
//     "Sourcegraph": {
//       "messages": [
//         {
//           "speaker": "human",
//           "content": [
//             {
//               "type": "image_url",
//               "image_url": {
//                 "url": "data:image/png;base64,${FILE_URI_0}"
//               }
//             }
//           ]
//         },
//         {
//           "role": "assistant",
//           "content": [{ "type": "text", "text": "This is a picture of a cat." }]
//         },
//         {
//           "speaker": "human",
//           "text": "What is the weather like in San Francisco?"
//         }
//       ],
//       "tools": [
//         {
//           "type": "function",
//           "function": {
//             "name": "get_current_weather",
//             "description": "Get the current weather in a given location",
//             "parameters": {
//               "type": "object",
//               "properties": {
//                 "location": {
//                   "type": "string",
//                   "description": "The city and state, e.g. San Francisco, CA"
//                 },
//                 "unit": {
//                   "type": "string",
//                   "enum": ["celsius"]
//                 }
//               },
//               "required": ["location"]
//             }
//           }
//         }
//       ]
//     },
//     "Anthropic": {
//       "messages": [
//         {
//           "role": "user",
//           "content": "What is the weather like in San Francisco?"
//         },
//         {
//           "role": "assistant",
//           "content": [
//             {
//               "type": "text",
//               "text": "<thinking>To answer this question, I will: 1. Use the get_weather tool to get the current weather in San Francisco. 2. Use the get_time tool to get the current time in the America/Los_Angeles timezone, which covers San Francisco, CA.</thinking>"
//             },
//             {
//               "type": "tool_use",
//               "id": "toolu_01A09q90qw90lq917835lq9",
//               "name": "get_weather",
//               "input": { "location": "San Francisco, CA" }
//             }
//           ]
//         },
//         {
//           "role": "user",
//           "content": [
//             {
//               "type": "tool_result",
//               "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
//               "content": "15 degrees"
//             }
//           ]
//         },
//         {
//           "role": "assistant",
//           "content": [
//             {
//               "type": "text",
//               "text": "The current weather in San Francisco is 15 degrees Celsius (59 degrees Fahrenheit). It's a cool day in the city by the bay!"
//             }
//           ]
//         },
//         {
//           "role": "user",
//           "content": [
//             {
//               "type": "image",
//               "source": {
//                 "type": "url",
//                 "url": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
//               }
//             },
//             {
//               "type": "text",
//               "text": "Describe this image."
//             }
//           ]
//         }
//       ],
//       "tools": [{
//         "name": "get_weather",
//         "description": "Get the current weather in a given location",
//         "input_schema": {
//           "type": "object",
//           "properties": {
//             "location": {
//               "type": "string",
//               "description": "The city and state, e.g. San Francisco, CA"
//             },
//             "unit": {
//               "type": "string",
//               "enum": ["celsius", "fahrenheit"],
//               "description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
//             }
//           },
//           "required": ["location"]
//         }
//       }, {
//         "name": "get_time",
//         "description": "Get the current time in a given time zone",
//         "input_schema": {
//           "type": "object",
//           "properties": {
//             "timezone": {
//               "type": "string",
//               "description": "The IANA time zone name, e.g. America/Los_Angeles"
//             }
//           },
//           "required": ["timezone"]
//         }
//       }]
//     },
//     "Google": {
//       "contents": [
//         {
//           "role": "user",
//           "parts": [
//             {
//               "fileData": {
//                 "fileUri": "${FILE_URI_0}",
//                 "mimeType": "image/jpeg"
//               }
//             },
//             {
//               "text": "what is in the picture?"
//             }
//           ]
//         },
//         {
//           "role": "model",
//           "parts": [
//             {
//               "text": "The picture shows a seamless pattern of white, stylized clouds against a light blue background. The clouds have a rounded, puffy shape with a flat base."
//             }
//           ]
//         },
//         {
//           "role": "user",
//           "parts": [{
//             "text": "Which theaters in Mountain View show Barbie movie?"
//           }]
//         },
//         {
//           "role": "model",
//           "parts": [{
//             "functionCall": {
//               "name": "find_theaters",
//               "args": {
//                 "location": "Mountain View, CA",
//                 "movie": "Barbie"
//               }
//             }
//           }]
//         },
//         {
//           "role": "user",
//           "parts": [{
//             "functionResponse": {
//               "name": "find_theaters",
//               "response": {
//                 "name": "find_theaters",
//                 "content": {
//                   "movie": "Barbie",
//                   "theaters": [{
//                     "name": "AMC Mountain View 16",
//                     "address": "2000 W El Camino Real, Mountain View, CA 94040"
//                   }, {
//                     "name": "Regal Edwards 14",
//                     "address": "245 Castro St, Mountain View, CA 94040"
//                   }]
//                 }
//               }
//             }
//           }]
//         },
//         {
//           "role": "model",
//           "parts": [{
//             "text": " OK. Barbie is showing in two theaters in Mountain View, CA: AMC Mountain View 16 and Regal Edwards 14."
//           }]
//         }
//       ],
//       "tools": [{
//         "functionDeclarations": [{
//           "name": "find_movies",
//           "description": "find movie titles currently playing in theaters based on any description, genre, title words, etc.",
//           "parameters": {
//             "type": "OBJECT",
//             "properties": {
//               "location": {
//                 "type": "STRING",
//                 "description": "The city and state, e.g. San Francisco, CA or a zip code e.g. 95616"
//               },
//               "description": {
//                 "type": "STRING",
//                 "description": "Any kind of description including category or genre, title words, attributes, etc."
//               }
//             },
//             "required": ["description"]
//           }
//         }, {
//           "name": "find_theaters",
//           "description": "find theaters based on location and optionally movie title which is currently playing in theaters",
//           "parameters": {
//             "type": "OBJECT",
//             "properties": {
//               "location": {
//                 "type": "STRING",
//                 "description": "The city and state, e.g. San Francisco, CA or a zip code e.g. 95616"
//               },
//               "movie": {
//                 "type": "STRING",
//                 "description": "Any movie title"
//               }
//             },
//             "required": ["location"]
//           }
//         }, {
//           "name": "get_showtimes",
//           "description": "Find the start times for movies playing in a specific theater",
//           "parameters": {
//             "type": "OBJECT",
//             "properties": {
//               "location": {
//                 "type": "STRING",
//                 "description": "The city and state, e.g. San Francisco, CA or a zip code e.g. 95616"
//               },
//               "movie": {
//                 "type": "STRING",
//                 "description": "Any movie title"
//               },
//               "theater": {
//                 "type": "STRING",
//                 "description": "Name of the theater"
//               },
//               "date": {
//                 "type": "STRING",
//                 "description": "Date for requested showtime"
//               }
//             },
//             "required": ["location", "movie", "theater", "date"]
//           }
//         }]
//       }]
//     }
//   }

export function convertToCompletionsMessages(provider: string, messages: Message[]): any {
    switch (provider) {
        // Convert from Sourcegraph Messages to provider's Completions Request messages format
        case 'Anthropic':
            return convertToAnthropicMessages(messages)
        case 'Google':
            return convertToGoogleMessages(messages)
        default:
            throw new Error(`Unsupported provider: ${provider}`)
    }
}

export function convertToAnthropicMessages(messages: Message[]) {
    // Convert from Sourcegraph Message format to Anthropic message format
    // Sourcegraph format: { speaker, text, tools }
    // Anthropic format: { role, content }
    const anthropicMessages = []

    // Handle images and tools in the conversion
    for (const message of messages) {
        // Handle different content types
        let content: any = []
        const role = message.speaker

        // Handle text content
        if (message.text) {
            content.push({
                type: 'text',
                text: message.text,
            })
        }

        // Handle image content
        const { data } = getMessageImageUrl(message.content?.[0])
        if (data) {
            content.push({
                type: 'image',
                source: {
                    type: 'url',
                    url: data,
                },
            })
        }

        // If content is an empty array, or contains only simple text and no images/tools,
        // simplify to a string for simpler requests
        if (content.length === 1 && content[0].type === 'text' && role === 'human') {
            content = message.text
        }

        anthropicMessages.push({
            role,
            content,
        })
    }

    return {
        messages: anthropicMessages,
    }
}

export function convertToGoogleMessages(messages: Message[]) {
    // Convert from Sourcegraph Message format to Google message format
    // Sourcegraph format: { speaker, text, tools }
    // Google format: { contents: [{ role, parts }], tools }

    const googleContents = []

    // Handle images and tools in the conversion
    for (const message of messages) {
        // Convert speaker to role
        // "human" -> "user", "assistant" -> "model"
        const role = message.speaker === 'human' ? 'user' : 'model'
        const parts = []

        // Handle text content
        if (message.text) {
            parts.push({
                text: message.text,
            })
        }

        // Handle image content
        const { data, mimeType } = getMessageImageUrl(message.content?.[0], false)
        if (data && mimeType) {
            parts.push({
                inlineData: { mimeType, data },
            } satisfies InlineDataPart)
        }

        googleContents.push({
            role,
            parts,
        })
    }

    return {
        contents: googleContents,
    }
}

export function getMessageImageUrl(
    part?: MessagePart,
    keepData = true
): {
    data: string | undefined
    mimeType: string | undefined
} {
    if (part) {
        const url = (part.type === 'image_url' && part.image_url?.url) || undefined
        const mimeType = url?.split(';')[0].replace('data:', '')
        const result = { data: url, mimeType }
        if (keepData) {
            result.data = url?.replace(/data:[^;]+;base64,/, '')
        }
        return result
    }
    return { data: undefined, mimeType: undefined }
}

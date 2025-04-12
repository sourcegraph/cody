import type { Tool } from '@anthropic-ai/sdk/resources'
import type { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

// Function to convert Zod schema to Anthropic-compatible InputSchema
export function zodToolSchema(schema: z.ZodObject<any>): Tool.InputSchema {
    return zodToJsonSchema(schema) as Tool.InputSchema
}

export function parseToolCallArgs(args: unknown): unknown {
    try {
        return typeof args === 'string' ? JSON.parse(args) : args
    } catch (e) {
        return args
    }
}

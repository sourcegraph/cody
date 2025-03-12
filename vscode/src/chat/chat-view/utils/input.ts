import { logDebug } from '@sourcegraph/cody-shared'
import type { z } from 'zod'

// Utility function to validate tool input
export function validateWithZod<T>(schema: z.ZodType<T>, input: unknown, toolName: string): T {
    const parsed = schema.safeParse(sanitizeToolInput(input))
    if (!parsed.success) {
        const errorMsg = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        throw new Error(`${toolName} validation failed: ${errorMsg}`)
    }
    return parsed.data
}

function sanitizeToolInput(input: unknown): string | unknown {
    // Try to parse the input if it's a string that looks like JSON
    if (typeof input === 'string' && (input.startsWith('{') || input.startsWith('['))) {
        try {
            return JSON.parse(input)
        } catch (e) {
            // If parsing fails, continue with the original input
            // This allows strings that just happen to start with { or [ but aren't JSON
            logDebug('sanitizeToolInput', `Failed to parse input as JSON: ${input}`)
        }
    }
    return input
}

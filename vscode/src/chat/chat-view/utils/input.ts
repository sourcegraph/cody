import { logDebug } from '@sourcegraph/cody-shared'
import { jsonrepair } from 'jsonrepair'
import type { z } from 'zod'

// Utility function to validate tool input
export function validateWithZod<T>(schema: z.ZodType<T>, input: unknown, toolName: string): T {
    const parsed = schema.safeParse(sanitizeToolInput(input))
    if (!parsed.success) {
        const errorMsg = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
        logDebug('validateWithZod', `Validation error for ${toolName}: ${errorMsg}`)
        throw new Error(`${toolName} validation failed: ${errorMsg}`)
    }
    return parsed.data
}

export function sanitizeToolInput(input: unknown): string | unknown {
    // Only try to parse the input if it's a string that looks like JSON
    if (typeof input === 'string' && (input.startsWith('{') || input.startsWith('['))) {
        try {
            // First try standard parsing
            return JSON.parse(input)
        } catch (e) {
            // If standard parsing fails, try to repair it
            try {
                logDebug('sanitizeToolInput', `Attempting to repair malformed JSON: ${input}`)
                const repairedJson = jsonrepair(input)
                const result = JSON.parse(repairedJson)
                logDebug('sanitizeToolInput', `Successfully repaired JSON: ${repairedJson}`)
                return result
            } catch (repairError) {
                // If repair fails, continue with the original input
                logDebug('sanitizeToolInput', `Failed to repair JSON: ${input}`)
            }
        }
    }
    // Return the original input if it's not a string starting with { or [
    // or if all parsing attempts failed
    return input
}

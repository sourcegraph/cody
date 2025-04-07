import * as codyShared from '@sourcegraph/cody-shared'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { sanitizeToolInput, validateWithZod } from './input'

// Mock the logDebug function from cody-shared
vi.mock('@sourcegraph/cody-shared', () => ({
    logDebug: vi.fn(),
}))

describe('sanitizeToolInput', () => {
    // Test for valid JSON string input
    it('should parse valid JSON string input', () => {
        const input = '{"name": "test", "value": 123}'
        const result = sanitizeToolInput(input)
        expect(result).toEqual({ name: 'test', value: 123 })
    })

    // Test for valid JSON array string input
    it('should parse valid JSON array string input', () => {
        const input = '[1, 2, 3, "test"]'
        const result = sanitizeToolInput(input)
        expect(result).toEqual([1, 2, 3, 'test'])
    })

    // Test for malformed JSON that can be repaired
    it('should repair and parse malformed JSON', () => {
        const input = '{name: "test", value: 123}'
        const result = sanitizeToolInput(input)
        expect(result).toEqual({ name: 'test', value: 123 })
        expect(codyShared.logDebug).toHaveBeenCalledWith(
            'sanitizeToolInput',
            expect.stringContaining('Attempting to repair')
        )
        expect(codyShared.logDebug).toHaveBeenCalledWith(
            'sanitizeToolInput',
            expect.stringContaining('Successfully repaired')
        )
    })

    // Test for malformed JSON that cannot be repaired
    it('should return original input when JSON cannot be repaired', () => {
        const input = '{this is not valid JSON and cannot be repaired}'
        const result = sanitizeToolInput(input)
        expect(result).toBe(input)
        expect(codyShared.logDebug).toHaveBeenCalledWith(
            'sanitizeToolInput',
            expect.stringContaining('Attempting to repair')
        )
        expect(codyShared.logDebug).toHaveBeenCalledWith(
            'sanitizeToolInput',
            expect.stringContaining('Failed to repair')
        )
    })

    // Test for non-JSON string input
    it('should return original input for non-JSON string', () => {
        const input = 'This is just a regular string'
        const result = sanitizeToolInput(input)
        expect(result).toBe(input)
    })

    // Test for non-string input
    it('should return original input for non-string values', () => {
        const inputs = [123, true, null, undefined, { key: 'value' }, [1, 2, 3]]

        for (const input of inputs) {
            const result = sanitizeToolInput(input)
            expect(result).toBe(input)
        }
    })
})

// Also test the validateWithZod function since it uses sanitizeToolInput
describe('validateWithZod', () => {
    it('should validate and return data when input is valid', () => {
        const schema = z.object({ name: z.string(), value: z.number() })
        const input = '{"name": "test", "value": 123}'

        const result = validateWithZod(schema, input, 'TestTool')

        expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('should throw error when validation fails', () => {
        const schema = z.object({ name: z.string(), value: z.number() })
        const input = '{"name": "test", "value": "not a number"}'

        expect(() => validateWithZod(schema, input, 'TestTool')).toThrow('TestTool validation failed')
        expect(codyShared.logDebug).toHaveBeenCalledWith(
            'validateWithZod',
            expect.stringContaining('Validation error for TestTool')
        )
    })

    it('should validate non-string inputs directly', () => {
        const schema = z.object({ name: z.string(), value: z.number() })
        const input = { name: 'test', value: 123 }

        const result = validateWithZod(schema, input, 'TestTool')

        expect(result).toEqual({ name: 'test', value: 123 })
    })
})

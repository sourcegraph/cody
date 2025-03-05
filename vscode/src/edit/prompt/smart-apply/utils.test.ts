import { ps } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { getInstructionPromptWithCharLimit } from './utils'

describe('getInstructionPromptWithCharLimit', () => {
    it('should return original instruction when within char limit', () => {
        const instruction = ps`short instruction`
        const tokenLimit = 100

        const result = getInstructionPromptWithCharLimit(instruction, tokenLimit)

        expect(result).toBe(instruction)
    })

    it('should truncate instruction when exceeding char limit', () => {
        const instruction = ps`This is a very long instruction that needs to be truncated because it exceeds the character limit`
        const tokenLimit = 10 // Small limit to force truncation

        const result = getInstructionPromptWithCharLimit(instruction, tokenLimit)

        console.log(result.toString())
        // Should contain first part, ellipsis, and last part
        expect(result.toString()).toBe('This is a very lo...e character limit')
    })
})

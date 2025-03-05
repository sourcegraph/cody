import { type PromptString, ps } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../../../completions/test-helpers'
import {
    getCurrentTokenCount,
    getInstructionPromptWithCharLimit,
    getPrefixAndSuffixWithCharLimit,
} from './smart-apply-custom'

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

describe('getPrefixAndSuffixWithCharLimit', () => {
    it('should return prefix and suffix within char limits', async () => {
        const mockDocument = document(dedent`mock line 1
            mock line 2
            mock line 3
            mock line 4
            mock line 5
            mock line 6
            mock line 7
            mock line 8
            mock line 9
            mock line 10
        `)

        const prefixRange = new vscode.Range(0, 0, 5, 0)
        const suffixRange = new vscode.Range(5, 0, 10, 0)
        const tokenLimit = 10

        const result = getPrefixAndSuffixWithCharLimit(
            mockDocument,
            prefixRange,
            suffixRange,
            tokenLimit
        )

        expect(result).toHaveProperty('precedingText')
        expect(result).toHaveProperty('followingText')
        expect(result.precedingText.toString()).toBe(
            dedent`mock line 4
            mock line 5\n`
        )
        expect(result.followingText.toString()).toBe(
            dedent`mock line 6
            mock line 7
        `
        )
    })

    it('should handle empty ranges', async () => {
        const mockDocument = document('')

        const emptyRange = new vscode.Range(0, 0, 0, 0)
        const tokenLimit = 100

        const result = getPrefixAndSuffixWithCharLimit(mockDocument, emptyRange, emptyRange, tokenLimit)

        expect(result.precedingText.toString()).toBe('')
        expect(result.followingText.toString()).toBe('')
    })
})

describe('getCurrentTokenCount', () => {
    it('should return total token count for list of prompts', async () => {
        const prompts = [ps`First prompt`, ps`Second prompt`, ps`Third prompt`]

        const tokenCount = await getCurrentTokenCount(prompts)

        expect(typeof tokenCount).toBe('number')
        expect(tokenCount).toBeGreaterThan(0)
    })

    it('should return 0 for empty prompt list', async () => {
        const prompts: PromptString[] = []

        const tokenCount = await getCurrentTokenCount(prompts)

        expect(tokenCount).toBe(0)
    })
})

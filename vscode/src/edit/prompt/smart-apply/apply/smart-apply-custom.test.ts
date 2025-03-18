import { type PromptString, ps } from '@sourcegraph/cody-shared'
import { BotResponseMultiplexer } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../../../../completions/test-helpers'
import type { FixupTask } from '../../../../non-stop/FixupTask'
import type { BuildInteractionOptions } from '../../type'
import { getCurrentTokenCount, getPrefixAndSuffixWithCharLimit } from './smart-apply-custom'
import { SmartApplyCustomEditPromptBuilder } from './smart-apply-custom'

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

describe('SmartApplyCustomEditPromptBuilder', () => {
    const testFilePath = '/test/file.ts'
    const testDocument = document(
        'function test() {\n    console.log("hello")\n}',
        'typescript',
        testFilePath
    )

    beforeEach(() => {
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(uri => {
            return Promise.resolve(testDocument)
        })
    })

    it('builds correct interaction for smart apply task', async () => {
        const builder = new SmartApplyCustomEditPromptBuilder()

        const mockTask = {
            original: testDocument.getText(),
            inProgressReplacement: 'Hello',
            selectionRange: new vscode.Range(0, 0, 2, 0),
            document: testDocument,
            intent: 'smartApply',
            fixupFile: {
                uri: vscode.Uri.file(testFilePath),
            },
            smartApplyMetadata: {
                chatQuery: ps`Change console.log to console.error`,
                replacementCodeBlock: ps`console.error("hello")`,
            },
        } as FixupTask

        const builderOptions = {
            contextWindow: 2000,
            task: mockTask,
        } as BuildInteractionOptions

        const result = await builder.buildInteraction(builderOptions)

        expect(result.messages).toHaveLength(2)
        expect(result.messages[0].speaker).toBe('system')
        expect(result.messages[1].speaker).toBe('human')
        expect(result.stopSequences).toEqual([])
        expect(result.responseTopic).toBe(BotResponseMultiplexer.DEFAULT_TOPIC)
    })
})

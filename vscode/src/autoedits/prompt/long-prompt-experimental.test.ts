import { beforeEach } from 'node:test'
import { describe, expect, it, vi } from 'vitest'

import {
    type AutoEditsTokenLimit,
    type AutocompleteContextSnippet,
    testFileUri,
} from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../../completions/context/utils'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'

import type { UserPromptArgs } from './base'
import { LongTermPromptStrategy } from './long-prompt-experimental'
import { getCodeToReplaceData } from './prompt-utils'

describe('LongTermPromptStrategy', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    describe('getUserPrompt', () => {
        const getContextItem = (
            content: string,
            timeSinceActionMs: number,
            identifier: string,
            filePath = 'foo.ts'
        ): AutocompleteContextSnippet => ({
            type: 'file',
            content,
            identifier,
            uri: testFileUri(filePath),
            startLine: 0,
            endLine: 0,
            metadata: {
                timeSinceActionMs,
            },
        })

        const getUserPromptData = ({
            shouldIncludeContext,
        }: { shouldIncludeContext: boolean }): UserPromptArgs => {
            const prefix = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n')
            const suffix = Array.from({ length: 50 }, (_, i) => `line ${50 + i + 1}`).join('\n')
            const textContent = `${prefix}█\n${suffix}`

            const { document, position } = documentAndPosition(textContent)
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            const tokenBudget: AutoEditsTokenLimit = {
                prefixTokens: 10,
                suffixTokens: 10,
                maxPrefixLinesInArea: 4,
                maxSuffixLinesInArea: 4,
                codeToRewritePrefixLines: 3,
                codeToRewriteSuffixLines: 3,
                contextSpecificTokenLimit: {
                    [RetrieverIdentifier.RecentViewPortRetriever]: 100,
                    [RetrieverIdentifier.RecentEditsRetriever]: 100,
                    [RetrieverIdentifier.RecentCopyRetriever]: 100,
                    [RetrieverIdentifier.JaccardSimilarityRetriever]: 100,
                    [RetrieverIdentifier.DiagnosticsRetriever]: 100,
                },
            }
            const codeToReplaceData = getCodeToReplaceData({
                docContext,
                document,
                position,
                tokenBudget,
            })

            const context: AutocompleteContextSnippet[] = shouldIncludeContext
                ? [
                      getContextItem(
                          'view port context 1',
                          100,
                          RetrieverIdentifier.RecentViewPortRetriever,
                          'test0.ts'
                      ),
                      getContextItem(
                          'view port context 2',
                          100,
                          RetrieverIdentifier.RecentViewPortRetriever,
                          'test1.ts'
                      ),
                      getContextItem(
                          'view port context 3',
                          60 * 1000,
                          RetrieverIdentifier.RecentViewPortRetriever,
                          'test2.ts'
                      ),
                      getContextItem(
                          'view port context 4',
                          120 * 1000,
                          RetrieverIdentifier.RecentViewPortRetriever,
                          'test3.ts'
                      ),

                      getContextItem(
                          'recent edits context 1',
                          100,
                          RetrieverIdentifier.RecentEditsRetriever,
                          'test0.ts'
                      ),
                      getContextItem(
                          'recent edits context 2',
                          100,
                          RetrieverIdentifier.RecentEditsRetriever,
                          'test0.ts'
                      ),
                      getContextItem(
                          'recent edits context 3',
                          60 * 1000,
                          RetrieverIdentifier.RecentEditsRetriever,
                          'test3.ts'
                      ),
                      getContextItem(
                          'recent edits context 4',
                          120 * 1000,
                          RetrieverIdentifier.RecentEditsRetriever,
                          'test3.ts'
                      ),
                      getContextItem(
                          'recent edits context 5',
                          120 * 1000,
                          RetrieverIdentifier.RecentEditsRetriever,
                          'test2.ts'
                      ),

                      getContextItem(
                          'diagnostics context 1',
                          60 * 1000,
                          RetrieverIdentifier.DiagnosticsRetriever,
                          'test1.ts'
                      ),
                      getContextItem(
                          'diagnostics context 2',
                          120 * 1000,
                          RetrieverIdentifier.DiagnosticsRetriever,
                          'test1.ts'
                      ),
                      getContextItem(
                          'diagnostics context 3',
                          120 * 1000,
                          RetrieverIdentifier.DiagnosticsRetriever,
                          'test2.ts'
                      ),

                      getContextItem(
                          'recent copy context 1',
                          120 * 1000,
                          RetrieverIdentifier.RecentCopyRetriever,
                          'test1.ts'
                      ),
                      getContextItem(
                          'recent copy context 2',
                          120 * 1000,
                          RetrieverIdentifier.RecentCopyRetriever,
                          'test2.ts'
                      ),

                      getContextItem(
                          'jaccard similarity context 1',
                          120 * 1000,
                          RetrieverIdentifier.JaccardSimilarityRetriever,
                          'test1.ts'
                      ),
                      getContextItem(
                          'jaccard similarity context 2',
                          120 * 1000,
                          RetrieverIdentifier.JaccardSimilarityRetriever,
                          'test2.ts'
                      ),
                  ]
                : []

            return {
                codeToReplaceData,
                document,
                context,
                tokenBudget,
            }
        }

        const strategy = new LongTermPromptStrategy()

        it('creates prompt without context', () => {
            const userPromptData = getUserPromptData({ shouldIncludeContext: false })
            const prompt = strategy.getUserPrompt(userPromptData)
            expect(prompt.toString()).toMatchInlineSnapshot(`
              "Help me finish a coding change. You will see snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the code between the <|editable_region_start|> and <|editable_region_end|> tags, to match what you think I would do next in the codebase. <|user_cursor_is_here|> indicates the position of the cursor in the the current file. Note: I might have stopped in the middle of typing.



              The file currently open:
              (\`test.ts\`)
              <file>
              line 37
              line 38
              line 39
              line 40
              line 41
              line 42
              line 43
              line 44
              line 45
              line 46
              <|editable_region_start|>
              line 47
              line 48
              line 49
              line 50<|user_cursor_is_here|>
              line 51
              line 52
              line 53
              <|editable_region_end|>
              line 54
              line 55
              line 56
              line 57
              line 58
              line 59
              line 60
              line 61
              line 62
              line 63
              line 64
              </file>



              Continue where I left off and finish my change by rewriting the code between the <|editable_region_start|> and <|editable_region_end|> tags:"
            `)
        })

        it('creates prompt with context', () => {
            const userPromptData = getUserPromptData({ shouldIncludeContext: true })
            const prompt = strategy.getUserPrompt(userPromptData)
            expect(prompt.toString()).toMatchInlineSnapshot(`
              "Help me finish a coding change. You will see snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the code between the <|editable_region_start|> and <|editable_region_end|> tags, to match what you think I would do next in the codebase. <|user_cursor_is_here|> indicates the position of the cursor in the the current file. Note: I might have stopped in the middle of typing.

              Code snippets I have recently viewed, roughly from oldest to newest. Some may be irrelevant to the change:
              <recently_viewed_snippets>
              <snippet>
              (\`test3.ts\`)

              view port context 4
              </snippet>
              <snippet>
              (\`test2.ts\`)

              view port context 3
              </snippet>
              <snippet>
              (\`test1.ts\`)

              view port context 2
              </snippet>
              <snippet>
              (\`test0.ts\`)

              view port context 1
              </snippet>
              </recently_viewed_snippets>

              My recent edits, from oldest to newest:
              <diff_history>
              test2.ts
              recent edits context 5
              test3.ts
              recent edits context 4
              then
              recent edits context 3
              test0.ts
              recent edits context 2
              </diff_history>

              The file currently open:
              (\`test.ts\`)
              <file>
              line 37
              line 38
              line 39
              line 40
              line 41
              line 42
              line 43
              line 44
              line 45
              line 46
              <|editable_region_start|>
              line 47
              line 48
              line 49
              line 50<|user_cursor_is_here|>
              line 51
              line 52
              line 53
              <|editable_region_end|>
              line 54
              line 55
              line 56
              line 57
              line 58
              line 59
              line 60
              line 61
              line 62
              line 63
              line 64
              </file>

              Linter errors from the code that you will rewrite:
              <lint_errors>
              (\`test1.ts\`)

              diagnostics context 1

              diagnostics context 2

              (\`test2.ts\`)

              diagnostics context 3
              </lint_errors>

              <diff_history>
              test0.ts
              recent edits context 1
              </diff_history>

              Continue where I left off and finish my change by rewriting the code between the <|editable_region_start|> and <|editable_region_end|> tags:"
            `)
        })
    })

    describe('getRecentEditsPrompt', () => {
        const getContextItem = (
            content: string,
            filePath = 'foo.ts',
            identifier: string = RetrieverIdentifier.RecentEditsRetriever
        ): AutocompleteContextSnippet => ({
            type: 'file',
            content,
            identifier,
            uri: testFileUri(filePath),
            startLine: 0,
            endLine: 0,
        })

        beforeEach(() => {
            vi.useFakeTimers()
        })

        const strategy = new LongTermPromptStrategy()

        it('returns empty prompts when no context items are provided', () => {
            const result = strategy.getRecentEditsPrompt([])

            expect(result.shortTermEditsPrompt.toString()).toBe('')
            expect(result.longTermEditsPrompt.toString()).toBe('')
        })

        it('divides short term and long term edits correctly', () => {
            const snippet = [
                getContextItem('diff0', 'test0.ts'),
                getContextItem('diff1', 'test0.ts'),
                getContextItem('diff2', 'test0.ts'),
                getContextItem('diff3', 'test0.ts'),
                getContextItem('diff4', 'test1.ts'),
                getContextItem('diff5', 'test1.ts'),
                getContextItem('diff6', 'test2.ts'),
                getContextItem('diff7', 'test2.ts'),
                getContextItem('diff8', 'test0.ts'),
                getContextItem('diff9', 'test0.ts'),
            ]
            const result = strategy.getRecentEditsPrompt(snippet)
            expect(result.shortTermEditsPrompt.toString()).toMatchInlineSnapshot(`
              "<diff_history>
              test0.ts
              diff0
              </diff_history>"
            `)
            expect(result.longTermEditsPrompt.toString()).toMatchInlineSnapshot(`
              "My recent edits, from oldest to newest:
              <diff_history>
              test0.ts
              diff9
              then
              diff8
              test2.ts
              diff7
              then
              diff6
              test1.ts
              diff5
              then
              diff4
              test0.ts
              diff3
              then
              diff2
              then
              diff1
              </diff_history>"
            `)
        })

        it('combines consecutive diffs from the same file in long term edits', () => {
            const snippet = [
                getContextItem('diff0', 'test0.ts'),
                getContextItem('diff1', 'test0.ts'),
                getContextItem('diff2', 'test1.ts'),
                getContextItem('diff3', 'test1.ts'),
                getContextItem('diff4', 'test2.ts'),
            ]
            const result = strategy.getRecentEditsPrompt(snippet.slice(1))
            expect(result.longTermEditsPrompt.toString()).toMatchInlineSnapshot(`
              "My recent edits, from oldest to newest:
              <diff_history>
              test2.ts
              diff4
              test1.ts
              diff3
              then
              diff2
              </diff_history>"
            `)
        })
    })

    describe('computeLongTermRecentEditsPrompt', () => {
        const getContextItem = (
            content: string,
            filePath = 'foo.ts',
            identifier: string = RetrieverIdentifier.RecentEditsRetriever
        ): AutocompleteContextSnippet => ({
            type: 'file',
            content,
            identifier,
            uri: testFileUri(filePath),
            startLine: 0,
            endLine: 0,
        })

        const strategy = new LongTermPromptStrategy()

        it('returns empty prompt for empty context items', () => {
            // @ts-ignore - accessing private method for testing
            const result = strategy.computeLongTermRecentEditsPrompt([])
            expect(result.toString()).toBe('')
        })

        it('correctly groups and combines consecutive items by file name', () => {
            const snippet = [
                getContextItem('diff1', 'test0.ts'),
                getContextItem('diff2', 'test0.ts'),
                getContextItem('diff3', 'test1.ts'),
                getContextItem('diff4', 'test2.ts'),
                getContextItem('diff5', 'test2.ts'),
            ]
            // @ts-ignore - accessing private method for testing
            const result = strategy.computeLongTermRecentEditsPrompt(snippet)
            expect(result.toString()).toMatchInlineSnapshot(`
              "My recent edits, from oldest to newest:
              <diff_history>
              test2.ts
              diff5
              then
              diff4
              test1.ts
              diff3
              test0.ts
              diff2
              then
              diff1
              </diff_history>"
            `)
        })
    })
})

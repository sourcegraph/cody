import { beforeEach } from 'node:test'
import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import type { AutoEditsTokenLimit } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it, vi } from 'vitest'
import { RetrieverIdentifier } from '../../completions/context/utils'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import type { UserPromptArgs } from './base'
import { ShortTermPromptStrategy } from './short-term-diff-prompt-strategy'

describe('ShortTermPromptStrategy', () => {
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
                maxPrefixLinesInArea: 20,
                maxSuffixLinesInArea: 20,
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
                docContext,
                document,
                position,
                context,
                tokenBudget,
            }
        }

        const strategy = new ShortTermPromptStrategy()

        it('correct prompt rendering with context', () => {
            const userPromptData = getUserPromptData({ shouldIncludeContext: false })
            const { prompt } = strategy.getUserPrompt(userPromptData)
            expect(prompt.toString()).toEqual(dedent`
                Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.



                Here is the file that I am looking at (\`test.ts\`)
                <file>
                <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>
                </file>





                <area_around_code_to_rewrite>
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

                <code_to_rewrite>
                line 47
                line 48
                line 49
                line 50
                line 51
                line 52
                line 53

                </code_to_rewrite>
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

                </area_around_code_to_rewrite>


                Now, continue where I left off and finish my change by rewriting "code_to_rewrite":
            `)
        })

        it('correct prompt rendering with context', () => {
            const userPromptData = getUserPromptData({ shouldIncludeContext: true })
            const { prompt } = strategy.getUserPrompt(userPromptData)
            expect(prompt.toString()).toEqual(dedent`
                Help me finish a coding change. In particular, you will see a series of snippets from current open files in my editor, files I have recently viewed, the file I am editing, then a history of my recent codebase changes, then current compiler and linter errors, content I copied from my codebase. You will then rewrite the <code_to_rewrite>, to match what you think I would do next in the codebase. Note: I might have stopped in the middle of typing.

                Here are some snippets of code I have extracted from open files in my code editor. It's possible these aren't entirely relevant to my code change:
                <extracted_code_snippets>
                <snippet>
                (\`test1.ts\`)
                jaccard similarity context 1
                </snippet>
                <snippet>
                (\`test2.ts\`)
                jaccard similarity context 2
                </snippet>
                </extracted_code_snippets>

                Here are some snippets of code I have recently viewed, roughly from oldest to newest. It's possible these aren't entirely relevant to my code change:
                <recently_viewed_snippets>
                <snippet>
                (\`test3.ts\`)
                view port context 4
                </snippet>
                <snippet>
                (\`test2.ts\`)
                view port context 3
                </snippet>
                </recently_viewed_snippets>

                Here is the file that I am looking at (\`test.ts\`)
                <file>
                <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>
                </file>

                Here are some snippets of code I just looked at:
                <recently_viewed_snippets>
                <snippet>
                (\`test1.ts\`)
                view port context 2
                </snippet>
                <snippet>
                (\`test0.ts\`)
                view port context 1
                </snippet>
                </recently_viewed_snippets>

                Here is my recent series of edits from oldest to newest.
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

                Here are some linter errors from the code that you will rewrite.
                <lint_errors>
                (\`test1.ts\`)
                diagnostics context 1

                diagnostics context 2

                (\`test2.ts\`)
                diagnostics context 3
                </lint_errors>

                Here is some recent code I copied from the editor.
                <recent_copy>
                (\`test1.ts\`)
                recent copy context 1

                (\`test2.ts\`)
                recent copy context 2
                </recent_copy>

                <area_around_code_to_rewrite>
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

                <code_to_rewrite>
                line 47
                line 48
                line 49
                line 50
                line 51
                line 52
                line 53

                </code_to_rewrite>
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

                </area_around_code_to_rewrite>

                <diff_history>
                test0.ts
                recent edits context 1
                </diff_history>

                Now, continue where I left off and finish my change by rewriting "code_to_rewrite":
            `)
        })
    })

    describe('getRecentSnippetViewPrompt', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        const getContextItem = (
            content: string,
            timeSinceActionMs: number,
            filePath = 'foo.ts',
            identifier: string = RetrieverIdentifier.RecentViewPortRetriever
        ): AutocompleteContextSnippet => ({
            content,
            identifier,
            uri: testFileUri(filePath),
            startLine: 0,
            endLine: 0,
            metadata: {
                timeSinceActionMs,
            },
        })

        const strategy = new ShortTermPromptStrategy()

        it('returns empty prompts when no context items are provided', () => {
            const result = strategy.getRecentSnippetViewPrompt([])

            expect(result.shortTermViewPrompt.toString()).toBe('')
            expect(result.longTermViewPrompt.toString()).toBe('')
        })

        it('divide short term and long term snippets as per timestamp', () => {
            const snippet = [
                getContextItem('const test0 = true', 100, 'test0.ts'),
                getContextItem('const test1 = true', 100, 'test1.ts'),
                getContextItem('const test2 = false', 60 * 1000, 'test2.ts'),
                getContextItem('const test3 = null', 120 * 1000, 'test3.ts'),
            ]
            const result = strategy.getRecentSnippetViewPrompt(snippet)
            expect(result.shortTermViewPrompt.toString()).toBe(dedent`
                Here are some snippets of code I just looked at:
                <recently_viewed_snippets>
                <snippet>
                (\`test1.ts\`)
                const test1 = true
                </snippet>
                <snippet>
                (\`test0.ts\`)
                const test0 = true
                </snippet>
                </recently_viewed_snippets>
            `)
            expect(result.longTermViewPrompt.toString()).toBe(dedent`
                Here are some snippets of code I have recently viewed, roughly from oldest to newest. It's possible these aren't entirely relevant to my code change:
                <recently_viewed_snippets>
                <snippet>
                (\`test3.ts\`)
                const test3 = null
                </snippet>
                <snippet>
                (\`test2.ts\`)
                const test2 = false
                </snippet>
                </recently_viewed_snippets>
            `)
        })
    })

    describe('getRecentEditsPrompt', () => {
        const getContextItem = (
            content: string,
            filePath = 'foo.ts',
            identifier: string = RetrieverIdentifier.RecentEditsRetriever
        ): AutocompleteContextSnippet => ({
            content,
            identifier,
            uri: testFileUri(filePath),
            startLine: 0,
            endLine: 0,
        })

        beforeEach(() => {
            vi.useFakeTimers()
        })

        const strategy = new ShortTermPromptStrategy()

        it('returns empty prompts when no context items are provided', () => {
            const result = strategy.getRecentEditsPrompt([])

            expect(result.shortTermEditsPrompt.toString()).toBe('')
            expect(result.longTermEditsPrompt.toString()).toBe('')
        })

        it('combine consecutive diffs from a file into single prompt', () => {
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
            expect(result.shortTermEditsPrompt.toString()).toBe(dedent`
                <diff_history>
                test0.ts
                diff0
                </diff_history>
            `)
            expect(result.longTermEditsPrompt.toString()).toBe(dedent`
                Here is my recent series of edits from oldest to newest.
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
                </diff_history>
            `)
        })
    })
})

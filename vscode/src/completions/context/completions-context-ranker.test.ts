import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { ContextRankingStrategy, DefaultCompletionsContextRanker } from './completions-context-ranker'
import type { RetrievedContextResults } from './completions-context-ranker'

describe('DefaultCompletionsContextRanker', () => {
    describe('getContextSnippetsAsPerTimeBasedStrategy', () => {
        const getContextSnippet = (time?: number): AutocompleteContextSnippet => ({
            identifier: 'test',
            uri: vscode.Uri.parse('file:///test'),
            startLine: 1,
            endLine: 1,
            content: 'Snippet',
            metadata: {
                timeSinceActionMs: time,
            },
        })

        it('should sort snippets based on timeSinceActionMs in ascending order', () => {
            // Arrange
            const ranker = new DefaultCompletionsContextRanker(ContextRankingStrategy.TimeBased)

            const snippet1 = getContextSnippet(3000)
            const snippet2 = getContextSnippet(1000)
            const snippet3 = getContextSnippet(2000)

            const results: RetrievedContextResults[] = [
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet1]),
                },
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet2]),
                },
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet3]),
                },
            ]

            // Act
            const sortedSnippets = ranker.rankAndFuseContext(results)

            // Assert
            const sortedArray = Array.from(sortedSnippets)
            expect(sortedArray).toHaveLength(3)
            expect(sortedArray[0]).toEqual(snippet2)
            expect(sortedArray[1]).toEqual(snippet3)
            expect(sortedArray[2]).toEqual(snippet1)
        })

        it('should place snippets without timeSinceActionMs at the end', () => {
            // Arrange
            const ranker = new DefaultCompletionsContextRanker(ContextRankingStrategy.TimeBased)

            const snippet1 = getContextSnippet(1000)
            const snippet2 = getContextSnippet(undefined)
            const snippet3 = getContextSnippet(2000)

            const results: RetrievedContextResults[] = [
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet1]),
                },
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet2]),
                },
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet3]),
                },
            ]

            // Act
            const sortedSnippets = ranker.rankAndFuseContext(results)

            // Assert
            const sortedArray = Array.from(sortedSnippets)
            expect(sortedArray).toHaveLength(3)
            expect(sortedArray[0]).toEqual(snippet1)
            expect(sortedArray[1]).toEqual(snippet3)
            expect(sortedArray[2]).toEqual(snippet2) // Snippet without time should be last
        })

        it('stable sort for the undefined timeSinceActionMs', () => {
            // Arrange
            const ranker = new DefaultCompletionsContextRanker(ContextRankingStrategy.TimeBased)

            const snippet1 = getContextSnippet(undefined)
            const snippet2 = getContextSnippet(undefined)
            const snippet3 = getContextSnippet(undefined)

            const results: RetrievedContextResults[] = [
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet1, snippet2, snippet3]),
                },
            ]

            // Act
            const sortedSnippets = ranker.rankAndFuseContext(results)

            // Assert
            const sortedArray = Array.from(sortedSnippets)
            expect(sortedArray).toHaveLength(3)
            expect(sortedArray[0]).toEqual(snippet1)
            expect(sortedArray[1]).toEqual(snippet2)
            expect(sortedArray[2]).toEqual(snippet3) // Snippet without time should be last
        })

        it('should handle empty snippets gracefully', () => {
            // Arrange
            const ranker = new DefaultCompletionsContextRanker(ContextRankingStrategy.TimeBased)
            const results: RetrievedContextResults[] = []

            // Act
            const sortedSnippets = ranker.rankAndFuseContext(results)

            // Assert
            expect(sortedSnippets.size).toBe(0)
        })

        it('should handle multiple snippets within the same RetrievedContextResults', () => {
            // Arrange
            const ranker = new DefaultCompletionsContextRanker(ContextRankingStrategy.TimeBased)

            const snippet1 = getContextSnippet(1000)
            const snippet2 = getContextSnippet(500)
            const snippet3 = getContextSnippet(2500)

            const results: RetrievedContextResults[] = [
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet1, snippet2]),
                },
                {
                    identifier: 'test',
                    duration: 50,
                    snippets: new Set([snippet3]),
                },
            ]

            // Act
            const sortedSnippets = ranker.rankAndFuseContext(results)

            // Assert
            const sortedArray = Array.from(sortedSnippets)
            expect(sortedArray).toHaveLength(3)
            expect(sortedArray[0]).toEqual(snippet2)
            expect(sortedArray[1]).toEqual(snippet1)
            expect(sortedArray[2]).toEqual(snippet3)
        })
    })
})

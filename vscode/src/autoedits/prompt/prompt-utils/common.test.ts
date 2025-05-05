import { type AutocompleteContextSnippet, ps, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import {
    getCompletionsPromptWithSystemPrompt,
    getContextItemMappingWithTokenLimit,
    getContextItemsInTokenBudget,
    getContextPromptWithPath,
    joinPromptsWithNewlineSeparator,
} from './common'

describe('getContextPromptWithPath', () => {
    it('correct prompt with path', () => {
        const filePath = ps`/path/to/file.js`
        const content = ps`const foo = 1`
        const prompt = getContextPromptWithPath(filePath, content)
        expect(prompt.toString()).toBe(dedent`
            (\`/path/to/file.js\`)

            const foo = 1
        `)
    })
})

describe('getContextItemsInTokenBudget', () => {
    const getContextItem = (content: string, identifier: string): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri('foo.ts'),
        startLine: 0,
        endLine: 0,
    })

    it('returns all items when total content length is under chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('short content 1', 'test1'),
            getContextItem('short content 2', 'test2'),
        ]
        const tokenBudget = 100
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual(contextItems)
    })

    it('excludes items when total content length exceeds chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('a'.repeat(50), 'test1'),
            getContextItem('b'.repeat(60), 'test2'),
            getContextItem('c'.repeat(70), 'test3'),
        ]
        const tokenBudget = 20 // Set a token budget that results in a chars budget less than total content length
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result.length).toBe(1)
        expect(result[0].identifier).toBe('test1')
    })

    it('returns empty array when token budget is zero', () => {
        const contextItems: AutocompleteContextSnippet[] = [getContextItem('content', 'test1')]
        const tokenBudget = 0
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual([])
    })

    it('returns empty array when contextItems is empty', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const tokenBudget = 100
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual([])
    })

    it('skips items that individually exceed the chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('short content', 'test1'),
            getContextItem('very long content that exceeds the budget limit', 'test2'),
            getContextItem('another short content', 'test3'),
        ]
        const tokenBudget = 10
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result.length).toBe(2)
        expect(result[0].identifier).toBe('test1')
        expect(result[1].identifier).toBe('test3')
    })

    it('respects numItemsLimit when provided', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('short content 1', 'test1'),
            getContextItem('short content 2', 'test2'),
            getContextItem('short content 3', 'test3'),
        ]
        const tokenBudget = 100
        const numItemsLimit = 2
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget, numItemsLimit)
        expect(result.length).toBe(2)
        expect(result[0].identifier).toBe('test1')
        expect(result[1].identifier).toBe('test2')
    })

    it('prioritizes token budget over numItemsLimit', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('a'.repeat(100), 'test1'),
            getContextItem('b'.repeat(100), 'test2'),
            getContextItem('c'.repeat(100), 'test3'),
        ]
        const tokenBudget = 30 // Only enough for one item
        const numItemsLimit = 3
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget, numItemsLimit)
        expect(result.length).toBe(1)
        expect(result[0].identifier).toBe('test1')
    })
})

describe('getCompletionsPromptWithSystemPrompt', () => {
    it('creates a prompt in the correct format', () => {
        const systemPrompt = ps`System prompt`
        const userPrompt = ps`User prompt`
        const expectedPrompt = 'System prompt\n\nUser: User prompt\n\nAssistant:'
        const result = getCompletionsPromptWithSystemPrompt(systemPrompt, userPrompt)
        expect(result.toString()).toEqual(expectedPrompt)
    })
})

describe('joinPromptsWithNewlineSeparator', () => {
    it('joins multiple prompt strings with a new line separator', () => {
        const prompt = joinPromptsWithNewlineSeparator([ps`foo`, ps`bar`])
        expect(prompt.toString()).toBe(dedent`
            foo
            bar
        `)
    })

    it('joins multiple prompt strings with a custom separator', () => {
        const prompt = joinPromptsWithNewlineSeparator([ps`foo`, ps`bar`], ps`\n\n\n`)
        expect(prompt.toString()).toBe(dedent`
            foo


            bar
        `)
    })
})

describe('getContextItemMappingWithTokenLimit', () => {
    const getContextItem = (content: string, identifier: string): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri('foo.ts'),
        startLine: 0,
        endLine: 0,
    })

    it('groups items by identifier and applies token limits', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('content A1', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('content A2', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('content B1', RetrieverIdentifier.JaccardSimilarityRetriever),
            getContextItem('content B2', RetrieverIdentifier.JaccardSimilarityRetriever),
        ]

        const contextTokenLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 50,
            [RetrieverIdentifier.JaccardSimilarityRetriever]: 20,
        }

        const contextNumItemsLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 2,
            [RetrieverIdentifier.JaccardSimilarityRetriever]: 1,
        }

        const result = getContextItemMappingWithTokenLimit(
            contextItems,
            contextTokenLimitMapping,
            contextNumItemsLimitMapping
        )

        expect(result.size).toBe(2)
        expect(result.get(RetrieverIdentifier.RecentEditsRetriever)?.length).toBe(2)
        expect(result.get(RetrieverIdentifier.JaccardSimilarityRetriever)?.length).toBe(1)
        expect(result.get(RetrieverIdentifier.RecentEditsRetriever)?.[0].content).toBe('content A1')
        expect(result.get(RetrieverIdentifier.JaccardSimilarityRetriever)?.[0].content).toBe(
            'content B1'
        )
    })

    it('respects token limits over item count limits', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('a'.repeat(50), RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('b'.repeat(50), RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('c'.repeat(10), RetrieverIdentifier.JaccardSimilarityRetriever),
        ]

        const contextTokenLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 10, // Very small token limit
            [RetrieverIdentifier.JaccardSimilarityRetriever]: 100,
        }

        const contextNumItemsLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 2,
            [RetrieverIdentifier.JaccardSimilarityRetriever]: 2,
        }

        const result = getContextItemMappingWithTokenLimit(
            contextItems,
            contextTokenLimitMapping,
            contextNumItemsLimitMapping
        )

        expect(result.size).toBe(2)
        expect(result.get(RetrieverIdentifier.RecentEditsRetriever)?.length).toBe(0) // All items exceed budget
        expect(result.get(RetrieverIdentifier.JaccardSimilarityRetriever)?.length).toBe(1)
    })

    it('returns empty arrays for identifiers without token limits', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('content', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('content', RetrieverIdentifier.TscRetriever),
        ]

        const contextTokenLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 50,
        }

        const contextNumItemsLimitMapping = {
            [RetrieverIdentifier.RecentEditsRetriever]: 2,
            [RetrieverIdentifier.TscRetriever]: 2,
        }

        const result = getContextItemMappingWithTokenLimit(
            contextItems,
            contextTokenLimitMapping,
            contextNumItemsLimitMapping
        )

        expect(result.size).toBe(2)
        expect(result.get(RetrieverIdentifier.RecentEditsRetriever)?.length).toBe(1)
        expect(result.get(RetrieverIdentifier.TscRetriever)?.length).toBe(0) // No token limit for retriever2
    })
})

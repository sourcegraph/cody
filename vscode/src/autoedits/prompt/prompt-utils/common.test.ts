import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { type AutocompleteContextSnippet, ps, testFileUri } from '@sourcegraph/cody-shared'
import {
    getCompletionsPromptWithSystemPrompt,
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

import { describe, expect, it } from 'vitest'

import { contentSanitizer } from './helpers'

const correctResponse = `export function getRerankWithLog(
    chatClient: ChatClient
): (query: string, results: ContextResult[]) => Promise<{ results: ContextResult[]; duration: number }> {
    if (TestSupport.instance) {
        const reranker = TestSupport.instance.getReranker()
        return (query: string, results: ContextResult[]): Promise<{ results: ContextResult[]; duration: number }> => {
            const start = Date.now()
            const rerankedResults = reranker.rerank(query, results)
            const duration = Date.now() - start
            return { results: rerankedResults, duration }
        }
    }

    const reranker = new LLMReranker(chatClient)
    return async (
        userQuery: string,
        results: ContextResult[]
    ): Promise<{ results: ContextResult[]; duration: number }> => {
        const start = Date.now()
        const rerankedResults = await reranker.rerank(userQuery, results)
        const duration = Date.now() - start
        logDebug('Reranker:rerank', JSON.stringify({ duration }))
        return { results: rerankedResults, duration }
    }
}`

describe('contentSanitizer', () => {
    it('handles clean prompt correct', () => {
        const sanitizedPrompt = contentSanitizer(correctResponse)
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles problematic prompt correct', () => {
        const sanitizedPrompt = contentSanitizer('<selectedCode>' + correctResponse + '</selectedCode>')
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles partially problematic prompt correctly', () => {
        const sanitizedPrompt = contentSanitizer('<problemCode>' + correctResponse)
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles problematic prompt correctly with whitespace', () => {
        const sanitizedPrompt = contentSanitizer('   <fixup>' + correctResponse + '</fixup>   ')
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles problematic prompt correctly with whitespace across new lines', () => {
        const sanitizedPrompt = contentSanitizer('\n   <selectedCode>' + correctResponse + '</selectedCode>   \n')
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('removes fixup tags', () => {
        const text = '<fixup>Hello</fixup>'
        const result = contentSanitizer(text)
        expect(result).toBe('Hello')
    })

    it('removes code blocks', () => {
        const text = '```js\ncode\n```'
        const result = contentSanitizer(text)
        expect(result).toBe('')
    })

    it('removes CDATA tags', () => {
        const text = '<![CDATA[]]>\nexample'
        const result = contentSanitizer(text)
        expect(result).toBe('example')
    })

    it('removes tags prefix', () => {
        const text = 'tags: hello'
        const result = contentSanitizer(text)
        expect(result).toBe('hello')
    })

    it('keeps preceding whitespace from lines', () => {
        const text = '\n    hello'
        const result = contentSanitizer(text)
        expect(result).toBe('    hello')
    })
})

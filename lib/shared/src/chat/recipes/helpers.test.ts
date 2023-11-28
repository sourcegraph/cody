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
        const sanitizedPrompt = contentSanitizer('<SELECTEDCODE7662>' + correctResponse + '</SELECTEDCODE7662>')
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles problematic prompt correctly with whitespace', () => {
        const sanitizedPrompt = contentSanitizer('   <CODE5711>' + correctResponse + '</CODE5711>   ')
        expect(sanitizedPrompt).toBe(correctResponse)
    })

    it('handles problematic prompt correctly with whitespace across new lines', () => {
        const sanitizedPrompt = contentSanitizer(
            '\n   <SELECTEDCODE7662>' + correctResponse + '</SELECTEDCODE7662>   \n'
        )
        expect(sanitizedPrompt).toBe(correctResponse)
    })
})

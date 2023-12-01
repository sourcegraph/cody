import { describe, expect, it, vi } from 'vitest'

import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition } from '../test-helpers'
import { ContextRetriever, ContextSnippet } from '../types'

import { ContextMixer } from './context-mixer'
import type { ContextStrategyFactory } from './context-strategy'

function createMockStrategy(resultSets: ContextSnippet[][]): ContextStrategyFactory {
    const retrievers = []
    for (const [index, set] of resultSets.entries()) {
        retrievers.push({
            identifier: `retriever${index + 1}`,
            retrieve: () => Promise.resolve(set),
            isSupportedForLanguageId: () => true,
            dispose: vi.fn(),
        } satisfies ContextRetriever)
    }

    const mockStrategyFactory = {
        getStrategy: vi.fn().mockReturnValue({
            name: retrievers.length > 0 ? 'jaccard-similarity' : 'none',
            retrievers,
        }),
        dispose: vi.fn(),
    } satisfies ContextStrategyFactory

    return mockStrategyFactory
}

const { document, position } = documentAndPosition('console.█')
const docContext = getCurrentDocContext({
    document,
    position,
    maxPrefixLength: 100,
    maxSuffixLength: 100,
    dynamicMultilineCompletions: false,
})

const defaultOptions = {
    document,
    position,
    docContext,
    maxChars: 1000,
}

describe('ContextMixer', () => {
    describe('with no retriever', () => {
        it('returns empty result if no retrievers', async () => {
            const mixer = new ContextMixer(createMockStrategy([]))
            const { context, logSummary } = await mixer.getContext(defaultOptions)

            expect(context).toEqual([])
            expect(logSummary).toEqual({ duration: 0, retrieverStats: {}, strategy: 'none', totalChars: 0 })
        })
    })

    describe('with one retriever', () => {
        it('returns the results of the retriever', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            fileName: 'foo.ts',
                            content: 'function foo() {}',
                        },
                        {
                            fileName: 'bar.ts',
                            content: 'function bar() {}',
                        },
                    ],
                ])
            )
            const { context, logSummary } = await mixer.getContext(defaultOptions)

            expect(context).toEqual([
                {
                    fileName: 'foo.ts',
                    content: 'function foo() {}',
                },
                {
                    fileName: 'bar.ts',
                    content: 'function bar() {}',
                },
            ])
            expect(logSummary).toEqual({
                duration: expect.any(Number),
                retrieverStats: {
                    retriever1: {
                        duration: expect.any(Number),
                        positionBitmap: 3,
                        retrievedItems: 2,
                        suggestedItems: 2,
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 34,
            })
        })
    })

    describe('with more retriever', () => {
        it('mixes the results of the retriever using reciprocal rank fusion', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            fileName: 'foo.ts',
                            content: 'function foo1() {}',
                        },
                        {
                            fileName: 'bar.ts',
                            content: 'function bar1() {}',
                        },
                    ],

                    [
                        {
                            fileName: 'baz.ts',
                            content: 'function baz2() {}',
                        },
                        {
                            fileName: 'baz.ts',
                            content: 'function baz2.2() {}',
                        },
                        {
                            fileName: 'bar.ts',
                            content: 'function bar2() {}',
                        },
                    ],
                ])
            )
            const { context, logSummary } = await mixer.getContext(defaultOptions)

            expect(context).toMatchInlineSnapshot(`
              [
                {
                  "content": "function bar1() {}",
                  "fileName": "bar.ts",
                },
                {
                  "content": "function bar2() {}",
                  "fileName": "bar.ts",
                },
                {
                  "content": "function foo1() {}",
                  "fileName": "foo.ts",
                },
                {
                  "content": "function baz2() {}",
                  "fileName": "baz.ts",
                },
                {
                  "content": "function baz2.2() {}",
                  "fileName": "baz.ts",
                },
              ]
            `)
            expect(logSummary).toEqual({
                duration: expect.any(Number),
                retrieverStats: {
                    retriever1: {
                        duration: expect.any(Number),
                        positionBitmap: 0b00101,
                        retrievedItems: 2,
                        suggestedItems: 2,
                    },
                    retriever2: {
                        duration: expect.any(Number),
                        positionBitmap: 0b11010,
                        retrievedItems: 3,
                        suggestedItems: 3,
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 92,
            })
        })
    })
})

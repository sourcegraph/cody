// New imports needed:
import { describe, expect, it, vi } from 'vitest'

import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition } from '../test-helpers'
import { ContextRetriever } from '../types'

import { ContextMixer } from './context-mixer'
import type { ContextStrategyFactory } from './context-strategy'

describe('ContextMixer', () => {
    it('calls strategy factory to get strategy', async () => {
        const { document, position } = documentAndPosition('console.█')
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const mockStrategyFactory = {
            getStrategy: vi.fn().mockReturnValue({
                name: 'none',
                retrievers: [],
            }),
            dispose: vi.fn(),
        } satisfies ContextStrategyFactory

        const mixer = new ContextMixer(mockStrategyFactory)
        await mixer.getContext({
            document,
            position,
            docContext,
            maxChars: 1000,
        })

        expect(mockStrategyFactory.getStrategy).toHaveBeenCalledWith(document)
    })

    describe('with no retriever', () => {
        it('returns empty result if no retrievers', async () => {
            const { document, position } = documentAndPosition('console.█')
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            const mockStrategyFactory = {
                getStrategy: vi.fn().mockReturnValue({
                    name: 'none',
                    retrievers: [],
                }),
                dispose: vi.fn(),
            } satisfies ContextStrategyFactory

            const mixer = new ContextMixer(mockStrategyFactory)
            const { context, logSummary } = await mixer.getContext({
                document,
                position,
                docContext,
                maxChars: 1000,
            })

            expect(context).toEqual([])
            expect(logSummary).toEqual({ duration: 0, retrieverStats: {}, strategy: 'none', totalChars: 0 })
        })
    })

    describe('with one retriever', () => {
        it('returns the results of the retriever', async () => {
            const { document, position } = documentAndPosition('console.█')
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            const retriever = {
                identifier: 'test',
                retrieve: () =>
                    Promise.resolve([
                        {
                            fileName: 'foo.ts',
                            content: 'function foo() {}',
                        },
                        {
                            fileName: 'bar.ts',
                            content: 'function bar() {}',
                        },
                    ]),
                isSupportedForLanguageId: () => true,
                dispose: vi.fn(),
            } satisfies ContextRetriever

            const mockStrategyFactory = {
                getStrategy: vi.fn().mockReturnValue({
                    name: 'jaccard-similarity',
                    retrievers: [retriever],
                }),
                dispose: vi.fn(),
            } satisfies ContextStrategyFactory

            const mixer = new ContextMixer(mockStrategyFactory)
            const { context, logSummary } = await mixer.getContext({
                document,
                position,
                docContext,
                maxChars: 1000,
            })

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
                    test: {
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
            const { document, position } = documentAndPosition('console.█')
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            const retriever1 = {
                identifier: 'retriever1',
                retrieve: () =>
                    Promise.resolve([
                        {
                            fileName: 'foo.ts',
                            content: 'function foo1() {}',
                        },
                        {
                            fileName: 'bar.ts',
                            content: 'function bar1() {}',
                        },
                    ]),
                isSupportedForLanguageId: () => true,
                dispose: vi.fn(),
            } satisfies ContextRetriever

            const retriever2 = {
                identifier: 'retriever2',
                retrieve: () =>
                    Promise.resolve([
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
                    ]),
                isSupportedForLanguageId: () => true,
                dispose: vi.fn(),
            } satisfies ContextRetriever

            const mockStrategyFactory = {
                getStrategy: vi.fn().mockReturnValue({
                    name: 'jaccard-similarity',
                    retrievers: [retriever1, retriever2],
                }),
                dispose: vi.fn(),
            } satisfies ContextStrategyFactory

            const mixer = new ContextMixer(mockStrategyFactory)
            const { context, logSummary } = await mixer.getContext({
                document,
                position,
                docContext,
                maxChars: 1000,
            })

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

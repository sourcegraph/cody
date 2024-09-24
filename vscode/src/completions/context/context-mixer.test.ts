import {
    type AutocompleteContextSnippet,
    contextFiltersProvider,
    testFileUri,
    uriBasename,
} from '@sourcegraph/cody-shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition } from '../test-helpers'
import type { ContextRetriever } from '../types'
import { ContextMixer } from './context-mixer'
import type { ContextStrategyFactory } from './context-strategy'

import type * as vscode from 'vscode'

function createMockStrategy(resultSets: AutocompleteContextSnippet[][]): ContextStrategyFactory {
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
        getStrategy: vi.fn().mockResolvedValue({
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
})

const defaultOptions = {
    document,
    position,
    docContext,
    maxChars: 1000,
}

describe('ContextMixer', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
    })

    describe('with no retriever', () => {
        it('returns empty result if no retrievers', async () => {
            const mixer = new ContextMixer(createMockStrategy([]))
            const { context, logSummary } = await mixer.getContext(defaultOptions)

            expect(normalize(context)).toEqual([])
            expect(logSummary).toEqual({
                duration: 0,
                retrieverStats: {},
                strategy: 'none',
                totalChars: 8,
                prefixChars: 8,
                suffixChars: 0,
            })
        })
    })

    describe('with one retriever', () => {
        it('returns the results of the retriever', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('bar.ts'),
                            content: 'function bar() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                    ],
                ])
            )
            const { context, logSummary } = await mixer.getContext(defaultOptions)
            expect(normalize(context)).toEqual([
                {
                    fileName: 'foo.ts',
                    content: 'function foo() {}',
                    identifier: 'jaccard-similarity',
                    startLine: 0,
                    endLine: 0,
                },
                {
                    fileName: 'bar.ts',
                    content: 'function bar() {}',
                    identifier: 'jaccard-similarity',
                    startLine: 0,
                    endLine: 0,
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
                        retrieverChars: 34,
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 42,
                prefixChars: 8,
                suffixChars: 0,
            })
        })
    })

    describe('with more retriever', () => {
        it('mixes the results of the retriever using reciprocal rank fusion', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('bar.ts'),
                            content: 'function bar1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                    ],

                    [
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo3() {}',
                            startLine: 10,
                            endLine: 10,
                        },
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}\nfunction foo2() {}',
                            startLine: 0,
                            endLine: 1,
                        },
                        {
                            identifier: 'jaccard-similarity',
                            uri: testFileUri('bar.ts'),
                            content: 'function bar1() {}\nfunction bar2() {}',
                            startLine: 0,
                            endLine: 1,
                        },
                    ],
                ])
            )
            const { context, logSummary } = await mixer.getContext(defaultOptions)

            // The results have overlaps in `foo.ts` and `bar.ts`. `foo.ts` is ranked higher in both
            // result sets, thus we expect the overlapping `foo.ts` ranges to appear first.
            // `foo3()` only appears in one result set and should thus be ranked last.
            expect(normalize(context)).toMatchInlineSnapshot(`
              [
                {
                  "content": "function foo1() {}",
                  "endLine": 0,
                  "fileName": "foo.ts",
                  "identifier": "jaccard-similarity",
                  "startLine": 0,
                },
                {
                  "content": "function foo1() {}
              function foo2() {}",
                  "endLine": 1,
                  "fileName": "foo.ts",
                  "identifier": "jaccard-similarity",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}",
                  "endLine": 0,
                  "fileName": "bar.ts",
                  "identifier": "jaccard-similarity",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}
              function bar2() {}",
                  "endLine": 1,
                  "fileName": "bar.ts",
                  "identifier": "jaccard-similarity",
                  "startLine": 0,
                },
                {
                  "content": "function foo3() {}",
                  "endLine": 10,
                  "fileName": "foo.ts",
                  "identifier": "jaccard-similarity",
                  "startLine": 10,
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
                        retrieverChars: 36,
                    },
                    retriever2: {
                        duration: expect.any(Number),
                        positionBitmap: 0b11010,
                        retrievedItems: 3,
                        suggestedItems: 3,
                        retrieverChars: 92,
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 136,
                prefixChars: 8,
                suffixChars: 0,
            })
        })

        describe('retrieved context is filtered by context filters', () => {
            beforeAll(() => {
                vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockImplementation(
                    async (uri: vscode.Uri) => {
                        if (uri.path.includes('foo.ts')) {
                            return 'repo:foo'
                        }
                        return false as const
                    }
                )
            })
            it('mixes results are filtered', async () => {
                const mixer = new ContextMixer(
                    createMockStrategy([
                        [
                            {
                                identifier: 'jaccard-similarity',
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                            {
                                identifier: 'jaccard-similarity',
                                uri: testFileUri('foo/bar.ts'),
                                content: 'function bar1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                        ],
                        [
                            {
                                identifier: 'jaccard-similarity',
                                uri: testFileUri('test/foo.ts'),
                                content: 'function foo3() {}',
                                startLine: 10,
                                endLine: 10,
                            },
                            {
                                identifier: 'jaccard-similarity',
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}\nfunction foo2() {}',
                                startLine: 0,
                                endLine: 1,
                            },
                            {
                                identifier: 'jaccard-similarity',
                                uri: testFileUri('example/bar.ts'),
                                content: 'function bar1() {}\nfunction bar2() {}',
                                startLine: 0,
                                endLine: 1,
                            },
                        ],
                    ])
                )
                const { context } = await mixer.getContext(defaultOptions)
                const contextFiles = normalize(context)
                expect(contextFiles.map(c => c.fileName)).toEqual([
                    'foo.ts',
                    'foo.ts',
                    'foo.ts',
                    'bar.ts',
                    'bar.ts',
                ])
            })
        })
    })
})

function normalize(
    context: AutocompleteContextSnippet[]
): (Omit<AutocompleteContextSnippet, 'uri'> & { fileName: string })[] {
    return context.map(({ uri, ...rest }) => ({ ...rest, fileName: uriBasename(uri) }))
}

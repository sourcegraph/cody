import {
    type AutocompleteContextSnippet,
    contextFiltersProvider,
    testFileUri,
    uriBasename,
} from '@sourcegraph/cody-shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as vscode from 'vscode'
import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition } from '../test-helpers'
import type { ContextRetriever } from '../types'
import { ContextMixer } from './context-mixer'
import type { ContextStrategyFactory } from './context-strategy'
import { RetrieverIdentifier } from './utils'

function createMockedContextRetriever(
    identifier: string,
    snippets: AutocompleteContextSnippet[]
): ContextRetriever {
    return {
        identifier: identifier,
        retrieve: () => Promise.resolve(snippets),
        isSupportedForLanguageId: () => true,
        dispose: vi.fn(),
    } satisfies ContextRetriever
}

function createMockStrategy(resultSets: AutocompleteContextSnippet[][]): ContextStrategyFactory {
    const retrievers = []
    for (const [index, set] of resultSets.entries()) {
        const identifier = set[0]?.identifier || `retriever${index + 1}`
        retrievers.push(createMockedContextRetriever(identifier, set))
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
                    'jaccard-similarity': {
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
                            identifier: 'retriever1',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                        {
                            identifier: 'retriever1',
                            uri: testFileUri('bar.ts'),
                            content: 'function bar1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                    ],

                    [
                        {
                            identifier: 'retriever2',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo3() {}',
                            startLine: 10,
                            endLine: 10,
                        },
                        {
                            identifier: 'retriever2',
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}\nfunction foo2() {}',
                            startLine: 0,
                            endLine: 1,
                        },
                        {
                            identifier: 'retriever2',
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
                  "identifier": "retriever1",
                  "startLine": 0,
                },
                {
                  "content": "function foo1() {}
              function foo2() {}",
                  "endLine": 1,
                  "fileName": "foo.ts",
                  "identifier": "retriever2",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}",
                  "endLine": 0,
                  "fileName": "bar.ts",
                  "identifier": "retriever1",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}
              function bar2() {}",
                  "endLine": 1,
                  "fileName": "bar.ts",
                  "identifier": "retriever2",
                  "startLine": 0,
                },
                {
                  "content": "function foo3() {}",
                  "endLine": 10,
                  "fileName": "foo.ts",
                  "identifier": "retriever2",
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
                                identifier: 'retriever1',
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                            {
                                identifier: 'retriever1',
                                uri: testFileUri('foo/bar.ts'),
                                content: 'function bar1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                        ],
                        [
                            {
                                identifier: 'retriever2',
                                uri: testFileUri('test/foo.ts'),
                                content: 'function foo3() {}',
                                startLine: 10,
                                endLine: 10,
                            },
                            {
                                identifier: 'retriever2',
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}\nfunction foo2() {}',
                                startLine: 0,
                                endLine: 1,
                            },
                            {
                                identifier: 'retriever2',
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

    describe('ContextMixer with data collection retrievers', () => {
        let mixer: ContextMixer
        let getDataCollectionRetrieversSpy: any

        const createMockedRetrievers = (retrievers: any[]) =>
            retrievers.map(set => createMockedContextRetriever(set[0].identifier, set))

        const setupTest = (primaryRetrievers: any[], loggingRetrievers: any[]) => {
            mixer = new ContextMixer(createMockStrategy(primaryRetrievers))
            getDataCollectionRetrieversSpy = vi.spyOn(mixer as any, 'getDataCollectionRetrievers')
            getDataCollectionRetrieversSpy.mockReturnValue(createMockedRetrievers(loggingRetrievers))
        }

        it('extracts the correct `loggingSnippets` and `results` from the retrievers', async () => {
            const primaryRetrievers = [
                [
                    {
                        identifier: 'retriever1',
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() {}',
                        startLine: 0,
                        endLine: 0,
                    },
                    {
                        identifier: 'retriever1',
                        uri: testFileUri('bar.ts'),
                        content: 'function bar() {}',
                        startLine: 0,
                        endLine: 0,
                    },
                ],
            ]
            const loggingRetrievers = [
                [
                    {
                        identifier: RetrieverIdentifier.RecentEditsRetriever,
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() { return "Hello from foo"; }',
                        startLine: 0,
                        endLine: 2,
                    },
                ],
                [
                    {
                        identifier: RetrieverIdentifier.DiagnosticsRetriever,
                        uri: testFileUri('baz.ts'),
                        content: 'const baz = () => console.log("Hello, world!");',
                        startLine: 1,
                        endLine: 3,
                    },
                ],
                [
                    {
                        identifier: RetrieverIdentifier.RecentViewPortRetriever,
                        uri: testFileUri('qux.ts'),
                        content: 'class Qux { constructor() { this.value = 42; } }',
                        startLine: 5,
                        endLine: 7,
                    },
                ],
            ]

            setupTest(primaryRetrievers, loggingRetrievers)
            const { context, logSummary, contextLoggingSnippets } =
                await mixer.getContext(defaultOptions)

            expect(normalize(context)).toEqual([
                {
                    fileName: 'foo.ts',
                    content: 'function foo() {}',
                    identifier: 'retriever1',
                    startLine: 0,
                    endLine: 0,
                },
                {
                    fileName: 'bar.ts',
                    content: 'function bar() {}',
                    identifier: 'retriever1',
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
            expect(getDataCollectionRetrieversSpy).toHaveBeenCalled()
            expect(normalize(contextLoggingSnippets)).toEqual(
                loggingRetrievers.flatMap(set =>
                    set.map(({ uri, ...snippet }) => ({
                        ...snippet,
                        fileName: uriBasename(uri),
                    }))
                )
            )
        })

        it('handles empty logging retrievers', async () => {
            const primaryRetrievers = [
                [
                    {
                        identifier: 'retriever1',
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() {}',
                        startLine: 0,
                        endLine: 0,
                    },
                ],
            ]
            const loggingRetrievers: any[] = []

            setupTest(primaryRetrievers, loggingRetrievers)
            const { context, contextLoggingSnippets } = await mixer.getContext(defaultOptions)

            expect(normalize(context)).toHaveLength(1)
            expect(contextLoggingSnippets).toEqual([])
        })

        it('handles empty primary retrievers', async () => {
            const primaryRetrievers: any[] = []
            const loggingRetrievers = [
                [
                    {
                        identifier: RetrieverIdentifier.RecentEditsRetriever,
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() { return "Hello from foo"; }',
                        startLine: 0,
                        endLine: 2,
                    },
                ],
            ]

            setupTest(primaryRetrievers, loggingRetrievers)
            const { context, contextLoggingSnippets } = await mixer.getContext(defaultOptions)

            expect(context).toEqual([])
            expect(normalize(contextLoggingSnippets)).toHaveLength(1)
        })

        it('handles logging and primary retrievers with common identifier', async () => {
            const primaryRetrievers = [
                [
                    {
                        identifier: RetrieverIdentifier.RecentEditsRetriever,
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() {}',
                        startLine: 0,
                        endLine: 0,
                    },
                ],
            ]
            const loggingRetrievers = [
                [
                    {
                        identifier: RetrieverIdentifier.RecentEditsRetriever,
                        uri: testFileUri('foo.ts'),
                        content: 'function foo() { return "Hello from foo"; }',
                        startLine: 0,
                        endLine: 2,
                    },
                ],
            ]

            setupTest(primaryRetrievers, loggingRetrievers)
            const { context, contextLoggingSnippets } = await mixer.getContext(defaultOptions)

            expect(normalize(context)).toEqual([
                {
                    fileName: 'foo.ts',
                    content: 'function foo() {}',
                    identifier: RetrieverIdentifier.RecentEditsRetriever,
                    startLine: 0,
                    endLine: 0,
                },
            ])
            expect(normalize(contextLoggingSnippets)).toEqual([
                {
                    fileName: 'foo.ts',
                    content: 'function foo() {}',
                    identifier: RetrieverIdentifier.RecentEditsRetriever,
                    startLine: 0,
                    endLine: 0,
                },
            ])
        })
    })
})

function normalize(
    context: AutocompleteContextSnippet[]
): (Omit<AutocompleteContextSnippet, 'uri'> & { fileName: string })[] {
    return context.map(({ uri, ...rest }) => ({ ...rest, fileName: uriBasename(uri) }))
}

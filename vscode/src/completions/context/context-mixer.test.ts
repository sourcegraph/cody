import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ignores, isCodyIgnoredFile, testFileUri, uriBasename } from '@sourcegraph/cody-shared'

import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition } from '../test-helpers'
import type { ContextRetriever, ContextSnippet } from '../types'

import { CODY_IGNORE_URI_PATH } from '@sourcegraph/cody-shared/src/cody-ignore/ignore-helper'
import { Utils } from 'vscode-uri'
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

            expect(normalize(context)).toEqual([])
            expect(logSummary).toEqual({
                duration: 0,
                retrieverStats: {},
                strategy: 'none',
                totalChars: 0,
            })
        })
    })

    describe('with one retriever', () => {
        it('returns the results of the retriever', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            uri: testFileUri('foo.ts'),
                            content: 'function foo() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                        {
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
                    startLine: 0,
                    endLine: 0,
                },
                {
                    fileName: 'bar.ts',
                    content: 'function bar() {}',
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
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 42,
            })
        })
    })

    describe('with more retriever', () => {
        it('mixes the results of the retriever using reciprocal rank fusion', async () => {
            const mixer = new ContextMixer(
                createMockStrategy([
                    [
                        {
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                        {
                            uri: testFileUri('bar.ts'),
                            content: 'function bar1() {}',
                            startLine: 0,
                            endLine: 0,
                        },
                    ],

                    [
                        {
                            uri: testFileUri('foo.ts'),
                            content: 'function foo3() {}',
                            startLine: 10,
                            endLine: 10,
                        },
                        {
                            uri: testFileUri('foo.ts'),
                            content: 'function foo1() {}\nfunction foo2() {}',
                            startLine: 0,
                            endLine: 1,
                        },
                        {
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
                  "startLine": 0,
                },
                {
                  "content": "function foo1() {}
              function foo2() {}",
                  "endLine": 1,
                  "fileName": "foo.ts",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}",
                  "endLine": 0,
                  "fileName": "bar.ts",
                  "startLine": 0,
                },
                {
                  "content": "function bar1() {}
              function bar2() {}",
                  "endLine": 1,
                  "fileName": "bar.ts",
                  "startLine": 0,
                },
                {
                  "content": "function foo3() {}",
                  "endLine": 10,
                  "fileName": "foo.ts",
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
                    },
                    retriever2: {
                        duration: expect.any(Number),
                        positionBitmap: 0b11010,
                        retrievedItems: 3,
                        suggestedItems: 3,
                    },
                },
                strategy: 'jaccard-similarity',
                totalChars: 136,
            })
        })

        describe('retrived context is filtered by .cody/ignore', () => {
            const workspaceRoot = testFileUri('')
            beforeAll(() => {
                ignores.setActiveState(true)
                // all foo.ts files will be ignored
                ignores.setIgnoreFiles(workspaceRoot, [
                    {
                        uri: Utils.joinPath(workspaceRoot, '.', CODY_IGNORE_URI_PATH),
                        content: '**/foo.ts',
                    },
                ])
            })
            it('mixes results are filtered', async () => {
                const mixer = new ContextMixer(
                    createMockStrategy([
                        [
                            {
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                            {
                                uri: testFileUri('foo/bar.ts'),
                                content: 'function bar1() {}',
                                startLine: 0,
                                endLine: 0,
                            },
                        ],
                        [
                            {
                                uri: testFileUri('test/foo.ts'),
                                content: 'function foo3() {}',
                                startLine: 10,
                                endLine: 10,
                            },
                            {
                                uri: testFileUri('foo.ts'),
                                content: 'function foo1() {}\nfunction foo2() {}',
                                startLine: 0,
                                endLine: 1,
                            },
                            {
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
                // returns 2 bar.ts context
                expect(contextFiles?.length).toEqual(2)
                for (const context of contextFiles) {
                    expect(
                        isCodyIgnoredFile(Utils.joinPath(workspaceRoot, context.fileName))
                    ).toBeFalsy()
                }
            })
        })
    })
})

function normalize(context: ContextSnippet[]): (Omit<ContextSnippet, 'uri'> & { fileName: string })[] {
    return context.map(({ uri, ...rest }) => ({ ...rest, fileName: uriBasename(uri) }))
}

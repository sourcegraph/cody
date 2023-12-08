import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion, initTreeSitterParser } from '../test-helpers'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] hot streak', () => {
    describe('static multiline', () => {
        it('caches hot streaks completions that are streamed in', async () => {
            const firstParams = params(
                dedent`
                    function myFunction() {
                        console.log(1)
                        █
                    }
                `,
                [
                    completion`
                        ├console.log(2)
                        console.log(3)
                        console.log(4)
                        ┤
                    ┴┴┴┴
                `,
                ],
                {
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`
                            ├console.log(2)
                        ┤`)
                        onPartialResponse?.(completion`
                            ├console.log(2)
                            console.log(3)
                            console.┤
                        ┴┴┴┴`)
                        onPartialResponse?.(completion`
                            ├console.log(2)
                            console.log(3)
                            console.log(4)┤
                        ┴┴┴┴`)
                    },
                    hotStreak: true,
                }
            )
            const firstRequest = await getInlineCompletions(firstParams)

            expect(firstRequest?.items[0]?.insertText).toEqual('console.log(2)')

            const secondRequest = await getInlineCompletions({
                ...params(
                    dedent`
                        function myFunction() {
                            console.log(1)
                            console.log(2)
                            █
                        }
                    `,
                    // No network request needed!
                    [],
                    { hotStreak: true }
                ),
                // Reuse the request manager to get a cache hit
                requestManager: firstParams.requestManager,
            })

            expect(secondRequest?.items[0]?.insertText).toEqual('console.log(3)')
            expect(secondRequest?.source).toBe(InlineCompletionsResultSource.HotStreak)

            const thirdRequest = await getInlineCompletions({
                ...params(
                    dedent`
                        function myFunction() {
                            console.log(1)
                            console.log(2)
                            console.log(3)
                            █
                        }
                    `,
                    // No network request needed!
                    [],
                    { hotStreak: true }
                ),
                // Reuse the request manager to get a cache hit
                requestManager: firstParams.requestManager,
            })

            expect(thirdRequest?.items[0]?.insertText).toEqual('console.log(4)')
            expect(thirdRequest?.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        it('caches hot streaks completions that are added at the end of the request', async () => {
            const firstParams = params(
                dedent`
                    function myFunction() {
                        console.log(1)
                        █
                    }
                `,
                [
                    completion`
                        ├console.log(2)
                        console.log(3)
                        console.log(4)┤
                    ┴┴┴┴
                `,
                ],
                { hotStreak: true }
            )
            const firstRequest = await getInlineCompletions(firstParams)

            expect(firstRequest?.items[0]?.insertText).toEqual('console.log(2)')

            const secondRequest = await getInlineCompletions({
                ...params(
                    dedent`
                        function myFunction() {
                            console.log(1)
                            console.log(2)
                            █
                        }
                    `,
                    // No network request needed!
                    [],
                    { hotStreak: true }
                ),
                // Reuse the request manager to get a cache hit
                requestManager: firstParams.requestManager,
            })

            expect(secondRequest?.items[0]?.insertText).toEqual('console.log(3)')
            expect(secondRequest?.source).toBe(InlineCompletionsResultSource.HotStreak)

            const thirdRequest = await getInlineCompletions({
                ...params(
                    dedent`
                        function myFunction() {
                            console.log(1)
                            console.log(2)
                            console.log(3)
                            █
                        }
                    `,
                    // No network request needed!
                    [],
                    { hotStreak: true }
                ),
                // Reuse the request manager to get a cache hit
                requestManager: firstParams.requestManager,
            })

            expect(thirdRequest?.items[0]?.insertText).toEqual('console.log(4)')
            expect(thirdRequest?.source).toBe(InlineCompletionsResultSource.HotStreak)
        })
    })

    describe('dynamic multiline', () => {
        beforeAll(async () => {
            await initTreeSitterParser()
        })

        afterAll(() => {
            resetParsersCache()
        })

        it('works with dynamic multiline mode', async () => {
            const firstParams = params(
                dedent`
                    function myFunction(i) {
                        console.log(1)
                        █
                    }
                `,
                [
                    completion`
                        ├if(i > 1) {
                            console.log(2)
                        }
                        if(i > 2) {
                            console.log(3)
                        }
                        if(i > 3) {
                            console.log(4)
                        }┤
                    ┴┴┴┴
                `,
                ],
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                }
            )
            const firstRequest = await getInlineCompletions(firstParams)

            expect(firstRequest?.items[0]?.insertText).toEqual('if(i > 1) {\n        console.log(2)\n    }')

            const secondRequest = await getInlineCompletions({
                ...params(
                    dedent`
                        function myFunction(i) {
                            console.log(1)
                            if(i > 1) {
                                console.log(2)
                            }
                            █
                        }
                    `,
                    // No network request needed!
                    [],
                    {
                        dynamicMultilineCompletions: true,
                        hotStreak: true,
                    }
                ),
                // Reuse the request manager to get a cache hit
                requestManager: firstParams.requestManager,
            })

            expect(secondRequest?.items[0]?.insertText).toEqual('if(i > 2) {\n        console.log(3)\n    }')
            expect(secondRequest?.source).toBe(InlineCompletionsResultSource.HotStreak)
        })
    })
})

import { afterAll, beforeEach, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { initTreeSitterParser } from '../test-helpers'

import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] hot streak', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('static multiline', () => {
        it('caches hot streaks completions that are streamed in', async () => {
            const { requestManager, ...firstRequest } = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    █console.log(2)
                    █console.log(3)
                    console█.log(4)
                    █
                }`,
                {
                    hotStreak: true,
                    delayBetweenChunks: 50,
                }
            )

            await vi.runAllTimersAsync()
            // Wait for hot streak completions be yielded and cached.
            await firstRequest.completionResponseGeneratorPromise
            expect(firstRequest.items[0].insertText).toEqual('console.log(2)')

            const secondRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    console.log(2)
                    █
                }`,
                {
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(secondRequest.items[0].insertText).toEqual('console.log(3)')
            expect(secondRequest.source).toBe(InlineCompletionsResultSource.HotStreak)

            const thirdRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    console.log(2)
                    console.log(3)
                    █
                }`,
                {
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(thirdRequest.items[0].insertText).toEqual('console.log(4)')
            expect(thirdRequest.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        it('caches hot streaks completions that are added at the end of the request', async () => {
            const { requestManager, ...firstRequest } = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    █console.log(2)
                    console.log(3)
                    console.log(4)
                    █
                }`,
                { hotStreak: true }
            )

            expect(firstRequest.items[0].insertText).toEqual('console.log(2)')

            const secondRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    console.log(2)
                    █
                }`,
                {
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(secondRequest.items[0].insertText).toEqual('console.log(3)')
            expect(secondRequest.source).toBe(InlineCompletionsResultSource.HotStreak)

            const thirdRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    console.log(2)
                    console.log(3)
                    █
                }`,
                {
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(thirdRequest.items[0].insertText).toEqual('console.log(4)')
            expect(thirdRequest.source).toBe(InlineCompletionsResultSource.HotStreak)
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
            const { requestManager, ...firstRequest } = await getInlineCompletionsWithInlinedChunks(
                `function myFunction(i) {
                    console.log(1)
                    █if(i > 1) {
                        console.log(2)
                    }
                    if(i > 2) {
                        console.log(3)
                    }
                    if(i > 3) {
                        console.log(4)
                    }█
                }`,
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                }
            )

            expect(firstRequest.items[0].insertText).toEqual(
                'if(i > 1) {\n        console.log(2)\n    }'
            )

            const secondRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction(i) {
                    console.log(1)
                    if(i > 1) {
                        console.log(2)
                    }
                    █
                }`,
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(secondRequest.items[0].insertText).toEqual(
                'if(i > 2) {\n        console.log(3)\n    }'
            )
            expect(secondRequest.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        // TODO(valery): add more test cases
        it('yields a singleline completion early if `firstCompletionTimeout` elapses before the multiline completion is ready', async () => {
            const completionsPromise = getInlineCompletionsWithInlinedChunks(
                `function myFunction█() {
                    if(i > 1) {█
                        console.log(2)
                    }
                    if(i > 2) {
                        console.log(3)
                    }█
                    if(i > 3) {
                        console.log(4)
                    }
                }
                myFunction()
                █
                const`,
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                    delayBetweenChunks: 20,
                    providerOptions: {
                        firstCompletionTimeout: 10,
                    },
                }
            )

            // Wait for the first completion to be ready
            vi.advanceTimersByTime(15)
            // Release the `completionsPromise`
            await vi.runAllTimersAsync()

            const { requestManager, ...firstRequest } = await completionsPromise
            await firstRequest.completionResponseGeneratorPromise
            expect(firstRequest.items[0].insertText).toEqual('() {')

            const secondRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    █
                const`,
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(secondRequest.source).toBe(InlineCompletionsResultSource.HotStreak)
            expect(secondRequest.items[0].insertText).toMatchInlineSnapshot(
                `
              "if(i > 1) {
                      console.log(2)
                  }
                  if(i > 2) {
                      console.log(3)
                  }
                  if(i > 3) {
                      console.log(4)
                  }
              }"
            `
            )

            const thirdRequest = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    if(i > 1) {
                        console.log(2)
                    }
                    if(i > 2) {
                        console.log(3)
                    }
                    if(i > 3) {
                        console.log(4)
                    }
                }
                █
                const`,
                {
                    dynamicMultilineCompletions: true,
                    hotStreak: true,
                    // Reuse the request manager to get a cache hit
                    requestManager,
                }
            )

            expect(thirdRequest.source).toBe(InlineCompletionsResultSource.HotStreak)
            expect(thirdRequest.items[0].insertText).toMatchInlineSnapshot(
                `
              "myFunction()"
            `
            )
        })
    })
})

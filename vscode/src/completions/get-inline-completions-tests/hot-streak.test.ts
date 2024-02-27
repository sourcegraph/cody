import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
            let request = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    █console.log(2)
                    █console.log(3)
                    console█.log(4)
                    █
                }`,
                {
                    configuration: { autocompleteExperimentalHotStreak: true },
                    delayBetweenChunks: 50,
                }
            )

            await vi.runAllTimersAsync()
            // Wait for hot streak completions be yielded and cached.
            await request.completionResponseGeneratorPromise
            expect(request.items[0].insertText).toEqual('console.log(2)')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(3)')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(4)')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        it('caches hot streaks completions that are added at the end of the request', async () => {
            let request = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    console.log(1)
                    █console.log(2)
                    console.log(3)
                    console.log(4)
                    █
                }`,
                { configuration: { autocompleteExperimentalHotStreak: true } }
            )

            expect(request.items[0].insertText).toEqual('console.log(2)')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(3)')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(4)')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        it('supports completion chunks terminated in the middle of the line', async () => {
            let request = await getInlineCompletionsWithInlinedChunks(
                `function myFunction() {
                    const result = 'foo'
                    █console.log(result)
                    if█(i > 1) {
                        console.log(1)
                    █}
                    console.log(4)
                    return foo█
                }`,
                { configuration: { autocompleteExperimentalHotStreak: true } }
            )

            await request.completionResponseGeneratorPromise
            expect(request.items[0].insertText).toEqual('console.log(result)')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('if(i > 1) {')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(1)\n    }')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('console.log(4)')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('return foo')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
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
            let request = await getInlineCompletionsWithInlinedChunks(
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
                    configuration: {
                        autocompleteExperimentalDynamicMultilineCompletions: true,
                        autocompleteExperimentalHotStreak: true,
                    },
                }
            )

            expect(request.items[0].insertText).toEqual('if(i > 1) {\n        console.log(2)\n    }')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('if(i > 2) {\n        console.log(3)\n    }')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

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
                    configuration: {
                        autocompleteExperimentalDynamicMultilineCompletions: true,
                        autocompleteExperimentalHotStreak: true,
                    },
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

            let request = await completionsPromise
            await request.completionResponseGeneratorPromise
            expect(request.items[0].insertText).toEqual('() {')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
            expect(request.items[0].insertText).toMatchInlineSnapshot(
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

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
            expect(request.items[0].insertText).toMatchInlineSnapshot(
                `
              "myFunction()"
            `
            )
        })
    })
})

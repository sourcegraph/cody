import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { initTreeSitterParser } from '../test-helpers'

import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] hot streak', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    afterAll(() => {
        resetParsersCache()
    })

    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not attempt to extract hot streak completions if the resolves completion duplicates suffix', async () => {
        let request = await getInlineCompletionsWithInlinedChunks(
            `from experimental table
                █where other_completion_provider_enabled = false
                █and read = true
                █and whatever = false
                █
                where other_completion_provider_enabled = false
                and read = true
                `,
            {
                configuration: {
                    autocompleteAdvancedProvider: 'fireworks',
                },
                delayBetweenChunks: 50,
            }
        )

        await vi.runAllTimersAsync()

        // No completion is resolved here because the suggested text is the suffix duplicate.
        expect(request.items).toEqual([])

        // Go to the next line and wait for the new completion from the cache.
        request = await request.pressEnter()

        // No hot-streak completions are expected because the previous line didn't get a completion.
        expect(request.items).toEqual([])
    })

    describe('static multiline', () => {
        it('caches hot streaks completions that are streamed in', async () => {
            const thousandConsoleLogLines = 'console.log(1)\n'.repeat(1000)

            let request = await getInlineCompletionsWithInlinedChunks(
                `const shouldNotBeInTheDocumentPrefix = 10_000
                ${thousandConsoleLogLines}
                function myFunction() {
                    console.log(1)
                    █console.log(2)
                    █console.log(3)
                    console█.log(4)
                    █
                }`,
                {
                    configuration: {
                        autocompleteAdvancedProvider: 'fireworks',
                    },
                    delayBetweenChunks: 50,
                }
            )

            // Use long document text that is much longer than `contextHits.maxPrefixLength`
            // to test the hot streak behavior in long documents.
            expect(request.docContext.prefix.includes('shouldNotBeInTheDocumentPrefix')).toBeFalsy()

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
                }`
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
                    }█
                    console.log(4)
                    return foo█
                }`
            )

            await request.completionResponseGeneratorPromise
            expect(request.items[0].insertText).toEqual('console.log(result)')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('if(i > 1) {\n        console.log(1)\n    }')
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
                }`
            )

            expect(request.items[0].insertText).toEqual('if(i > 1) {\n        console.log(2)\n    }')

            request = await request.acceptFirstCompletionAndPressEnter()
            expect(request.items[0].insertText).toEqual('if(i > 2) {\n        console.log(3)\n    }')
            expect(request.source).toBe(InlineCompletionsResultSource.HotStreak)
        })

        it('yields a singleline completion early if `firstCompletionTimeout` elapses before the multiline completion is ready', async () => {
            let abortController: AbortController | undefined
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
                    delayBetweenChunks: 20,
                    providerOptions: {
                        firstCompletionTimeout: 10,
                    },
                    abortSignal: new AbortController().signal,
                    onNetworkRequest(_, requestManagerAbortController) {
                        abortController = requestManagerAbortController
                    },
                }
            )

            // Wait for the first completion to be ready
            await vi.advanceTimersByTimeAsync(10)
            expect(abortController?.signal.aborted).toBe(false)

            // Wait for the first hot streak completion to be ready
            await vi.advanceTimersByTimeAsync(10)
            // We anticipate that the streaming will be cancelled because the hot
            // streak text exceeds the maximum number of lines defined by `MAX_HOT_STREAK_LINES`.
            // TODO: expose completion chunks, enabling more explicit verification of this behavior.
            expect(abortController?.signal.aborted).toBe(true)

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

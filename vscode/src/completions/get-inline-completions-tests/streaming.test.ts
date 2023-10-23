import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion, nextTick } from '../test-helpers'

import { getInlineCompletions, params, V } from './helpers'

describe('[getInlineCompletions] streaming', () => {
    it('terminates early for a single-line request', async () => {
        const abortController = new AbortController()
        expect(
            await getInlineCompletions({
                ...params('const x = █', [completion`├1337\nconsole.log('what?');┤`], {
                    async onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`├1337\ncon┤`)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(true)
                    },
                }),
                abortSignal: abortController.signal,
            })
        ).toEqual<V>({
            items: [{ insertText: '1337' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('does not include unfinished lines in results', async () => {
        const abortController = new AbortController()
        expect(
            await getInlineCompletions({
                ...params('const x = █', [completion`├1337\nconsole.log('what?');┤`], {
                    async onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`├13┤`)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(false)
                        onPartialResponse?.(completion`├1337\n┤`)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(true)
                    },
                }),
                abortSignal: abortController.signal,
            })
        ).toEqual<V>({
            items: [{ insertText: '1337' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('uses the multi-line truncation logic to terminate early for multi-line completions', async () => {
        const abortController = new AbortController()
        const result = await getInlineCompletions({
            ...params(
                dedent`
                            function myFun() {
                                █
                            }
                        `,
                [
                    completion`
                                    ├console.log('what?')
                                }

                                function never(){}┤
                            `,
                ],
                {
                    async onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`
                                        ├console.log('what?')┤
                                    ┴┴┴┴
                                `)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(false)
                        onPartialResponse?.(completion`
                                        ├console.log('what?')
                                    }

                                    function never(){}┤
                                `)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(true)
                    },
                }
            ),
            abortSignal: abortController.signal,
        })

        expect(result?.items.map(item => item.insertText)).toEqual(["console.log('what?')"])
        expect(result?.source).toBe(InlineCompletionsResultSource.Network)
    })

    it('uses the next non-empty line comparison logic to terminate early for multi-line completions', async () => {
        const abortController = new AbortController()
        expect(
            await getInlineCompletions({
                ...params(
                    dedent`
                            function myFun() {
                                █
                                console.log('oh no')
                            }
                        `,
                    [
                        completion`
                                    ├const a = new Array()
                                    console.log('oh no')
                                }┤
                            `,
                    ],
                    {
                        async onNetworkRequest(_params, onPartialResponse) {
                            onPartialResponse?.(completion`
                                        ├const a = new Array()
                                        console.log('oh no')┤
                                    ┴┴┴┴
                                `)
                            await nextTick()
                            expect(abortController.signal.aborted).toBe(false)
                            onPartialResponse?.(completion`
                                        ├const a = new Array()
                                        console.log('oh no')
                                    ┤
                                `)
                            await nextTick()
                            expect(abortController.signal.aborted).toBe(true)
                        },
                    }
                ),
                abortSignal: abortController.signal,
            })
        ).toEqual<V>({
            items: [{ insertText: 'const a = new Array()' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('uses the multi-line truncation logic to terminate early for multi-line completions with leading new line', async () => {
        const abortController = new AbortController()

        const result = await getInlineCompletions({
            ...params(
                dedent`
                    function bubbleSort() {
                        █
                    }
                `,
                [
                    completion`\nconst merge = (left, right) => {\n  let arr = [];\n  while (left.length && right.length) {\n    if (true) {}\n  }\n}\nconsole.log()`,
                ],
                {
                    async onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(
                            completion`\nconst merge = (left, right) => {\n  let arr = [];\n  while (left.length && right.length) {\n    if (`
                        )
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(false)
                        onPartialResponse?.(
                            completion`\nconst merge = (left, right) => {\n  let arr = [];\n  while (left.length && right.length) {\n    if (true) {}\n  }\n}\nconsole.log()\n`
                        )
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(true)
                    },
                }
            ),
            abortSignal: abortController.signal,
        })

        expect(result?.items[0].insertText).toMatchInlineSnapshot(`
          "const merge = (left, right) => {
              let arr = [];
              while (left.length && right.length) {
                  if (true) {}
              }"
        `)
        expect(result?.source).toBe(InlineCompletionsResultSource.Network)
    })

    it.skip('cuts-off multlineline compeltions with inconsistent indentation correctly', async () => {
        const abortController = new AbortController()

        const result = await getInlineCompletions({
            ...params(
                dedent`
                    function bubbleSort() {
                        █
                    }
                `,
                [completion`// Bubble sort algorithm\nconst numbers = [5, 3, 6, 2, 10];\n`],
                {
                    async onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`// Bubble sort algorithm\nconst numbers = [5, 3, 6, 2, 10];\n`)
                        await nextTick()
                        expect(abortController.signal.aborted).toBe(false)
                    },
                }
            ),
            abortSignal: abortController.signal,
        })

        expect(result?.items[0].insertText).toMatchInlineSnapshot('"// Bubble sort algorithm"')
        expect(result?.source).toBe(InlineCompletionsResultSource.Network)
    })
})

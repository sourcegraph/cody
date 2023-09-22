import dedent from 'dedent'
import { describe, expect, test } from 'vitest'

import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion, nextTick } from '../test-helpers'

import { getInlineCompletions, params, V } from './helpers'

describe('[getInlineCompletions] streaming', () => {
    test('terminates early for a single-line request', async () => {
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

    test('does not include unfinished lines in results', async () => {
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

    test('uses the multi-line truncation logic to terminate early for multi-line completions', async () => {
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
                                    ┤
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

    test('uses the next non-empty line comparison logic to terminate early for multi-line completions', async () => {
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
})

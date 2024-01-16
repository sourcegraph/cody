import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { getInlineCompletions, params, type V } from './helpers'

describe('[getInlineCompletions] streaming', () => {
    it('terminates early for a single-line request', async () => {
        expect(
            await getInlineCompletions({
                ...params('const x = █', [completion`├1337\nconsole.log('what?');┤`], {
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`├1337\ncon┤`)
                    },
                }),
            })
        ).toEqual<V>({
            items: [{ insertText: '1337' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('does not include unfinished lines in results', async () => {
        expect(
            await getInlineCompletions({
                ...params('const x = █', [completion`├1337\nconsole.log('what?');┤`], {
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`├13┤`)
                        onPartialResponse?.(completion`├1337\n┤`)
                    },
                }),
            })
        ).toEqual<V>({
            items: [{ insertText: '1337' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('uses the multi-line truncation logic to terminate early for multi-line completions', async () => {
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
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`
                                        ├console.log('what?')┤
                                    ┴┴┴┴
                                `)
                        onPartialResponse?.(completion`
                                        ├console.log('what?')
                                    }

                                    function never(){}┤
                                `)
                    },
                }
            ),
        })

        expect(result?.items.map(item => item.insertText)).toEqual(["console.log('what?')"])
        expect(result?.source).toBe(InlineCompletionsResultSource.Network)
    })

    it('uses the next non-empty line comparison logic to terminate early for multi-line completions', async () => {
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
                        onNetworkRequest(_params, onPartialResponse) {
                            onPartialResponse?.(completion`
                                        ├const a = new Array()
                                        console.log('oh no')┤
                                    ┴┴┴┴
                                `)
                            onPartialResponse?.(completion`
                                        ├const a = new Array()
                                        console.log('oh no')
                                    ┤
                                `)
                        },
                    }
                ),
            })
        ).toEqual<V>({
            items: [{ insertText: 'const a = new Array()' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('uses the multi-line truncation logic to terminate early for multi-line completions with leading new line', async () => {
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
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(
                            completion`\nconst merge = (left, right) => {\n  let arr = [];\n  while (left.length && right.length) {\n    if (`
                        )
                        onPartialResponse?.(
                            completion`\nconst merge = (left, right) => {\n  let arr = [];\n  while (left.length && right.length) {\n    if (true) {}\n  }\n}\nconsole.log()\n`
                        )
                    },
                }
            ),
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

    it('cuts-off multlineline compeltions with inconsistent indentation correctly', async () => {
        const result = await getInlineCompletions({
            ...params(
                dedent`
                    function bubbleSort() {
                        █
                    }
                `,
                [completion`// Bubble sort algorithm\nconst numbers = [5, 3, 6, 2, 10];\n`],
                {
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`// Bubble sort algorithm\nconst numbers = [5, 3, 6, 2, 10];\n`)
                    },
                }
            ),
        })

        expect(result?.items[0].insertText).toMatchInlineSnapshot('"// Bubble sort algorithm"')
        expect(result?.source).toBe(InlineCompletionsResultSource.Network)
    })
})

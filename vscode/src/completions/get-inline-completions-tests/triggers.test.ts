import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { range } from '../../testutils/textDocument'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { getInlineCompletions, params, V } from './helpers'

describe('[getInlineCompletions] triggers', () => {
    describe('singleline', () => {
        it('after whitespace', async () =>
            expect(await getInlineCompletions(params('foo = █', [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            }))

        it('end of word', async () =>
            expect(await getInlineCompletions(params('foo█', [completion`()`]))).toEqual<V>({
                items: [{ insertText: '()' }],
                source: InlineCompletionsResultSource.Network,
            }))

        it('middle of line', async () => {
            const result = await getInlineCompletions(
                params('function bubbleSort(█)', [completion`array) {`, completion`items) {`])
            )

            expect(
                result?.items.map(item => ({
                    insertText: item.insertText,
                    range: item.range,
                }))
            ).toEqual([
                { insertText: 'array) {', range: range(0, 20, 0, 21) },
                { insertText: 'items) {', range: range(0, 20, 0, 21) },
            ])
        })

        describe('same line suffix behavior', () => {
            it('does not trigger when there are alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █ // x', []))).toBeNull())

            it('triggers when there are only non-alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █;', []))).toBeTruthy())
        })
    })

    describe('multiline', () => {
        it('triggers a multi-line completion at the start of a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function bubbleSort() {\n  █', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeMultiLine()
        })

        it('does not trigger a multi-line completion at a function call', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('bar(█)', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeSingleLine()
        })

        it('does not trigger a multi-line completion at a method call', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('foo.bar(█)', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeSingleLine()
        })

        describe('does not trigger a multi-line completion if a block already has content', () => {
            it('for a non-empty current line', async () => {
                const requests: CompletionParameters[] = []
                await getInlineCompletions(
                    params(
                        dedent`
                        function myFunction() {█

                            console.log('three')
                        }
                    `,
                        [],
                        {
                            onNetworkRequest(request) {
                                requests.push(request)
                            },
                        }
                    )
                )
                expect(requests).toBeSingleLine()
            })

            it('for an empty current line', async () => {
                const requests: CompletionParameters[] = []
                await getInlineCompletions(
                    params(
                        dedent`
                        function myFunction() {
                            █

                            console.log('three')
                        }
                    `,
                        [],
                        {
                            onNetworkRequest(request) {
                                requests.push(request)
                            },
                        }
                    )
                )
                expect(requests).toBeSingleLine()
            })
        })

        it('triggers a multi-line completion at a method declarations', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('method.hello () {█', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeMultiLine()
        })

        it('does not support multi-line completion on unsupported languages', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function looksLegit() {\n  █', [], {
                    languageId: 'elixir',
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeSingleLine()
        })

        it('requires an indentation to start a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function bubbleSort() {\n█', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toBeSingleLine()
        })
    })

    describe('closing symbols', () => {
        it.each(['{}█', '[]█', '()█'])('does not trigger for %s', async prompt =>
            expect(await getInlineCompletions(params(prompt, [completion`bar`]))).toEqual<V>(null)
        )
        it.each(['{}\n█', '[]\n█', '()\n█'])('does trigger for %s', async prompt =>
            expect(await getInlineCompletions(params(prompt, [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            })
        )
    })

    describe('empty line at end of file', () => {
        it.each(['function foo(){\n console.log()\n}\n\n█', 'const foo = bar\n\n█', 'function foo()\n\n█'])(
            'does not trigger for empty line with an empty line above %s',
            async prompt => expect(await getInlineCompletions(params(prompt, [completion`bar`]))).toBeNull()
        )

        it.each(['function log(foo: string){\n█', '// console.log foo\n█', '// log foo\nconst foo = bar\n█'])(
            'triggers completion for empty line when the line above is not empty %s',
            async prompt =>
                expect(await getInlineCompletions(params(prompt, [completion`console.log(foo)`]))).toEqual<V>({
                    items: [{ insertText: 'console.log(foo)' }],
                    source: InlineCompletionsResultSource.Network,
                })
        )

        it('trigger completion in an empty text doc', async () => {
            expect(await getInlineCompletions(params('█', [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            })
        })

        it('triggers completion at the start of an empty line where the line above is not empty', async () => {
            expect(await getInlineCompletions(params('function bubbleSort() {\n}\n█', [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            })
        })

        it('trigger completion at cursor position greater than 0', async () => {
            expect(await getInlineCompletions(params('\n  █', [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            })
        })

        it('trigger multi-line completion at cursor position greater than 0 inside a function', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function bubbleSort() {\n    █', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
        })
    })
})

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
                items: [expect.objectContaining({ insertText: 'bar' })],
                source: InlineCompletionsResultSource.Network,
            }))

        it('end of word', async () =>
            expect(await getInlineCompletions(params('foo█', [completion`()`]))).toEqual<V>({
                items: [expect.objectContaining({ insertText: '()' })],
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
})

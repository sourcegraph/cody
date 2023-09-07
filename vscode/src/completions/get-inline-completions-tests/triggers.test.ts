import dedent from 'dedent'
import { describe, expect, test } from 'vitest'

import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { range } from '../../testutils/textDocument'
import { InlineCompletionsResultSource } from '../getInlineCompletions'
import { completion } from '../test-helpers'
import { MULTILINE_STOP_SEQUENCE } from '../text-processing'

import { getInlineCompletions, params, V } from './helpers'

describe('[getInlineCompletions] triggers', () => {
    describe('singleline', () => {
        test('after whitespace', async () =>
            expect(await getInlineCompletions(params('foo = █', [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            }))

        test('end of word', async () =>
            expect(await getInlineCompletions(params('foo█', [completion`()`]))).toEqual<V>({
                items: [{ insertText: '()' }],
                source: InlineCompletionsResultSource.Network,
            }))

        test('middle of line', async () =>
            expect(
                await getInlineCompletions(
                    params('function bubbleSort(█)', [completion`array) {`, completion`items) {`])
                )
            ).toEqual<V>({
                items: [
                    { insertText: 'array) {', range: range(0, 20, 0, 21) },
                    { insertText: 'items) {', range: range(0, 20, 0, 21) },
                ],
                source: InlineCompletionsResultSource.Network,
            }))

        describe('same line suffix behavior', () => {
            test('does not trigger when there are alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █ // x', []))).toBeNull())

            test('triggers when there are only non-alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █;', []))).toBeTruthy())
        })
    })

    describe('multiline', () => {
        test('triggers a multi-line completion at the start of a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function bubbleSort() {\n  █', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain(MULTILINE_STOP_SEQUENCE)
        })

        test('does not trigger a multi-line completion at a function call', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('bar(█)', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain(MULTILINE_STOP_SEQUENCE)
        })

        test('does not trigger a multi-line completion at a method call', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('foo.bar(█)', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain(MULTILINE_STOP_SEQUENCE)
        })

        test('does not trigger a multi-line completion if a block already has content', async () => {
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
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain(MULTILINE_STOP_SEQUENCE)
        })

        test('triggers a multi-line completion at a method declarations', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('method.hello () {█', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain(MULTILINE_STOP_SEQUENCE)
        })
        test('does not support multi-line completion on unsupported languages', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function looksLegit() {\n  █', [], {
                    languageId: 'elixir',
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain(MULTILINE_STOP_SEQUENCE)
        })

        test('requires an indentation to start a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(
                params('function bubbleSort() {\n█', [], {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                })
            )
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain(MULTILINE_STOP_SEQUENCE)
        })
    })
})

import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { range } from '../../testutils/textDocument'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { type Params, type V, getInlineCompletions, params } from './helpers'

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
                params('function bubbleSort(█)', [completion`array) {`])
            )

            expect(
                result?.items.map(item => ({
                    insertText: item.insertText,
                    range: item.range,
                }))
            ).toEqual([{ insertText: 'array) {', range: range(0, 20, 0, 21) }])
        })

        describe('same line suffix behavior', () => {
            it('does not trigger when there are alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █ // x', []))).toBeNull())

            it('triggers when there are only non-alphanumeric chars in the line suffix', async () =>
                expect(await getInlineCompletions(params('foo = █;', []))).toBeTruthy())
        })
    })

    describe('multiline', () => {
        function isMultiline(code: string, config?: Params): boolean {
            return Boolean(params(code, [], config).docContext.multilineTrigger)
        }

        it('triggers a multi-line completion at the start of a block', async () => {
            expect(isMultiline('function bubbleSort() {\n  █')).toBe(true)
        })

        it('does not trigger a multi-line completion at a function call', async () => {
            expect(isMultiline('bar(█)')).toBe(false)
        })

        it('does not trigger a multi-line completion at a method call', async () => {
            expect(isMultiline('foo.bar(█)')).toBe(false)
        })

        describe('does not trigger a multi-line completion if a block already has content', () => {
            it('for a non-empty current line', async () => {
                const code = dedent`
                    function myFunction() {█

                        console.log('three')
                    }
                `

                expect(isMultiline(code)).toBe(false)
            })

            it('for an empty current line', async () => {
                const code = dedent`
                        function myFunction() {
                            █

                            console.log('three')
                        }
                    `
                expect(isMultiline(code)).toBe(false)
            })
        })

        it('triggers a multi-line completion at a method declarations', async () => {
            expect(isMultiline('method.hello () {█')).toBe(true)
        })

        it('does not support multi-line completion on unsupported languages', async () => {
            expect(isMultiline('function looksLegit() {\n  █', { languageId: 'julia' })).toBe(false)
        })

        it('requires an indentation to start a block', async () => {
            expect(isMultiline('function bubbleSort() {\n█')).toBe(false)
        })
    })

    describe('closing symbols', () => {
        it.each(['{}█', '[]█', '()█', ';█'])('does not trigger for %s', async prompt =>
            expect(await getInlineCompletions(params(prompt, [completion`bar`]))).toEqual<V>(null)
        )
        it.each(['{}\n█', '[]\n█', '()\n█', ';\n█'])('does trigger for %s', async prompt =>
            expect(await getInlineCompletions(params(prompt, [completion`bar`]))).toEqual<V>({
                items: [{ insertText: 'bar' }],
                source: InlineCompletionsResultSource.Network,
            })
        )
    })

    describe('empty line at end of file', () => {
        const insertText = 'console.log(foo)'

        it('does not trigger when the line above is empty', async () =>
            expect(
                await getInlineCompletions(
                    params('function foo(){\n console.log()\n}\n\n█', [completion`bar`])
                )
            ).toBeNull())

        it('does trigger for empty document', async () =>
            expect(await getInlineCompletions(params('█', [completion`console.log(foo)`]))).toEqual<V>({
                items: [{ insertText }],
                source: InlineCompletionsResultSource.Network,
            }))

        it('does trigger for empty line with non-empty line above', async () =>
            expect(
                await getInlineCompletions(
                    params('function log(foo: string){\n█', [completion`console.log(foo)`])
                )
            ).toEqual<V>({
                items: [{ insertText }],
                source: InlineCompletionsResultSource.Network,
            }))

        it('does trigger when cursor beyond character position zero', async () =>
            expect(
                await getInlineCompletions(params('\n   █', [completion`console.log(foo)`]))
            ).toEqual<V>({
                items: [{ insertText }],
                source: InlineCompletionsResultSource.Network,
            }))
    })
})

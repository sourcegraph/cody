import dedent from 'dedent'
import { describe, expect, test } from 'vitest'

import { InlineCompletionsResultSource } from '../getInlineCompletions'
import { completion } from '../test-helpers'

import { getInlineCompletions, getInlineCompletionsInsertText, params, T, V } from './helpers'

describe('[getInlineCompletions] post-processing', () => {
    test('preserves leading whitespace when prefix has no trailing whitespace', async () =>
        expect(
            await getInlineCompletions(
                params('const isLocalHost = window.location.host█', [completion`├ === 'localhost'┤`])
            )
        ).toEqual<V>({
            items: [{ insertText: " === 'localhost'" }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('collapses leading whitespace when prefix has trailing whitespace', async () =>
        expect(await getInlineCompletions(params('const x = █', [completion`├${T}7┤`]))).toEqual<V>({
            items: [{ insertText: '7' }],
            source: InlineCompletionsResultSource.Network,
        }))

    describe('bad completion starts', () => {
        test.each([
            [completion`├➕     1┤`, '1'],
            [completion`├${'\u200B'}   1┤`, '1'],
            [completion`├.      1┤`, '1'],
            [completion`├+  1┤`, '1'],
            [completion`├-  1┤`, '1'],
        ])('fixes %s to %s', async (completion, expected) =>
            expect(await getInlineCompletions(params('█', [completion]))).toEqual<V>({
                items: [{ insertText: expected }],
                source: InlineCompletionsResultSource.Network,
            })
        )
    })

    describe('odd indentation', () => {
        test('filters out odd indentation in single-line completions', async () =>
            expect(await getInlineCompletions(params('const foo = █', [completion`├ 1┤`]))).toEqual<V>({
                items: [{ insertText: '1' }],
                source: InlineCompletionsResultSource.Network,
            }))
    })

    test('ranks results by number of lines', async () => {
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    function test() {
                        █
                `,
                [
                    completion`
                        ├console.log('foo')
                        console.log('foo')┤
                    ┴┴┴┴
                    `,
                    completion`
                        ├console.log('foo')
                        console.log('foo')
                        console.log('foo')
                        console.log('foo')
                        console.log('foo')┤
                    ┴┴┴┴`,
                    completion`
                        ├console.log('foo')┤
                    `,
                ]
            )
        )

        expect(items[0]).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')"
            `)
        expect(items[1]).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')"
            `)
        expect(items[2]).toBe("console.log('foo')")
    })

    test('dedupes duplicate results', async () => {
        expect(
            await getInlineCompletionsInsertText(
                params(
                    dedent`
                    function test() {
                        █
                `,
                    [completion`return true`, completion`return true`, completion`return true`]
                )
            )
        ).toEqual(['return true'])
    })
})

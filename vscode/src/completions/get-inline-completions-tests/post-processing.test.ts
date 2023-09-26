import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { InlineCompletionsResultSource } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { getInlineCompletions, getInlineCompletionsInsertText, params, T, V } from './helpers'

describe('[getInlineCompletions] post-processing', () => {
    it('preserves leading whitespace when prefix has no trailing whitespace', async () =>
        expect(
            await getInlineCompletions(
                params('const isLocalHost = window.location.host█', [completion`├ === 'localhost'┤`])
            )
        ).toEqual<V>({
            items: [expect.objectContaining({ insertText: " === 'localhost'" })],
            source: InlineCompletionsResultSource.Network,
        }))

    it('collapses leading whitespace when prefix has trailing whitespace', async () =>
        expect(await getInlineCompletions(params('const x = █', [completion`├${T}1337┤`]))).toEqual<V>({
            items: [expect.objectContaining({ insertText: '1337' })],
            source: InlineCompletionsResultSource.Network,
        }))

    describe('bad completion starts', () => {
        it.each([
            [completion`├➕     foo┤`, 'foo'],
            [completion`├${'\u200B'}   foo┤`, 'foo'],
            [completion`├.      foo┤`, 'foo'],
            [completion`├+  foo┤`, 'foo'],
            [completion`├-  foo┤`, 'foo'],
        ])('fixes %s to %s', async (completion, expected) =>
            expect(await getInlineCompletions(params('█', [completion]))).toEqual<V>({
                items: [expect.objectContaining({ insertText: expected })],
                source: InlineCompletionsResultSource.Network,
            })
        )
    })

    describe('odd indentation', () => {
        it('filters out odd indentation in single-line completions', async () =>
            expect(await getInlineCompletions(params('const foo = █', [completion`├ 1337┤`]))).toEqual<V>({
                items: [expect.objectContaining({ insertText: '1337' })],
                source: InlineCompletionsResultSource.Network,
            }))
    })

    it('ranks results by number of lines', async () => {
        const items = await getInlineCompletionsInsertText(
            params(
                dedent`
                    function it() {
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

    it('dedupes duplicate results', async () => {
        expect(
            await getInlineCompletionsInsertText(
                params(
                    dedent`
                    function it() {
                        █
                `,
                    [completion`return true`, completion`return true`, completion`return true`]
                )
            )
        ).toEqual(['return true'])
    })

    // c.f. https://github.com/sourcegraph/cody/issues/872
    it('removes single character completions', async () => {
        expect(
            await getInlineCompletionsInsertText(
                params(
                    dedent`
                        function it() {
                            █
                    `,
                    [completion`}`]
                )
            )
        ).toEqual([])
    })
})

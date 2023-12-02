import dedent from 'dedent'
import { pick } from 'lodash'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { range } from '../../testutils/textDocument'
import { resetParsersCache } from '../../tree-sitter/parser'
import { completion, initTreeSitterParser } from '../test-helpers'

import { getInlineCompletions, getInlineCompletionsInsertText, params, T } from './helpers'

const cases = [true, false]

// Run truncation tests for both strategies: indentation-based and tree-sitter-based.
// We cannot use `describe.each` here because `toMatchInlineSnapshot` is not supported with it.
cases.forEach(isTreeSitterEnabled => {
    const label = isTreeSitterEnabled ? 'enabled' : 'disabled'

    describe(`[getInlineCompletions] post-processing with tree-sitter ${label}`, () => {
        beforeAll(async () => {
            if (isTreeSitterEnabled) {
                await initTreeSitterParser()
            }
        })

        afterAll(() => {
            resetParsersCache()
        })

        it('preserves leading whitespace when prefix has no trailing whitespace', async () =>
            expect(
                await getInlineCompletionsInsertText(
                    params('const isLocalHost = window.location.host█', [completion`├ === 'localhost'┤`])
                )
            ).toEqual([" === 'localhost'"]))

        it('collapses leading whitespace when prefix has trailing whitespace', async () =>
            expect(await getInlineCompletionsInsertText(params('const x = █', [completion`├${T}1337┤`]))).toEqual([
                '1337',
            ]))

        describe('bad completion starts', () => {
            it.each([
                [completion`├➕     foo┤`, 'foo'],
                [completion`├${'\u200B'}   foo┤`, 'foo'],
                [completion`├.      foo┤`, 'foo'],
                [completion`├+  foo┤`, 'foo'],
                [completion`├-  foo┤`, 'foo'],
            ])('fixes %s to %s', async (completion, expected) =>
                expect(await getInlineCompletionsInsertText(params('█', [completion]))).toEqual([expected])
            )
        })

        describe('odd indentation', () => {
            it('filters out odd indentation in single-line completions', async () =>
                expect(await getInlineCompletionsInsertText(params('const foo = █', [completion`├ 1337┤`]))).toEqual([
                    '1337',
                ]))
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

        it('removes appends the injected prefix to the completion response since this is not sent to the LLM', async () => {
            expect(
                await getInlineCompletionsInsertText(
                    params(
                        dedent`
                        console.l█
                    `,
                        [completion`('hello world')`],
                        {
                            takeSuggestWidgetSelectionIntoAccount: true,
                            selectedCompletionInfo: { text: 'log', range: range(0, 8, 0, 9) },
                        }
                    )
                )
            ).toEqual(["og('hello world')"])
        })

        if (isTreeSitterEnabled) {
            async function getCompletionItems(code: string, completions: string[]) {
                const completionResult = await getInlineCompletions(
                    params(
                        dedent(code),
                        completions.map(completion => ({
                            completion,
                            stopReason: 'unknown',
                        }))
                    )
                )

                if (completionResult?.items) {
                    return completionResult.items
                }

                throw new Error('Expected to have `items` in a `completionResult`')
            }

            it('adds parse info to single-line completions', async () => {
                const completions = await getCompletionItems('function sort(█', ['array) {}', 'array) new'])

                expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
            })

            it('respects completion insert ranges', async () => {
                const completions = await getCompletionItems('function sort(█)', ['array) {}', 'array) new'])

                expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
            })

            it('adds parse info to multi-line completions', async () => {
                const completions = await getCompletionItems(
                    `
                        function hello() {
                            alert('hello world!')
                        }

                        const one = []; function sort(█)
                    `,
                    ['array) {\nreturn array.sort()\n} function two() {}', 'array) new\n']
                )

                expect(
                    completions.map(c =>
                        pick(c, ['insertText', 'nodeTypes', 'nodeTypesWithCompletion', 'parseErrorCount'])
                    )
                ).toMatchInlineSnapshot(`
                  [
                    {
                      "insertText": "array) {",
                      "nodeTypes": {
                        "atCursor": "(",
                        "grandparent": "function_signature",
                        "greatGrandparent": "program",
                        "lastAncestorOnTheSameLine": "function_signature",
                        "parent": "formal_parameters",
                      },
                      "nodeTypesWithCompletion": {
                        "atCursor": "(",
                        "grandparent": "function_declaration",
                        "greatGrandparent": "program",
                        "lastAncestorOnTheSameLine": "function_declaration",
                        "parent": "formal_parameters",
                      },
                      "parseErrorCount": 0,
                    },
                  ]
                `)
            })

            it('adds parse info to single-line completions', async () => {
                const [item] = await getCompletionItems('const one = █', ['"one"'])

                expect(pick(item, ['insertText', 'nodeTypes', 'nodeTypesWithCompletion', 'parseErrorCount']))
                    .toMatchInlineSnapshot(`
                      {
                        "insertText": "\\"one\\"",
                        "nodeTypes": {
                          "atCursor": "program",
                          "grandparent": undefined,
                          "greatGrandparent": undefined,
                          "lastAncestorOnTheSameLine": "program",
                          "parent": undefined,
                        },
                        "nodeTypesWithCompletion": {
                          "atCursor": "variable_declarator",
                          "grandparent": "program",
                          "greatGrandparent": undefined,
                          "lastAncestorOnTheSameLine": "lexical_declaration",
                          "parent": "lexical_declaration",
                        },
                        "parseErrorCount": 0,
                      }
                    `)
            })
        }
    })
})

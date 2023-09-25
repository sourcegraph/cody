import dedent from 'dedent'
import { beforeAll, describe, expect, test } from 'vitest'
import Parser from 'web-tree-sitter'

import { range } from '../../testutils/textDocument'
import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition, initTreeSitterParser } from '../test-helpers'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

import { adjustRangeToOverwriteOverlappingCharacters, processInlineCompletions } from './process-inline-completions'

describe('adjustRangeToOverwriteOverlappingCharacters', () => {
    test('no adjustment at end of line', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                currentLineSuffix: '',
            })
        ).toEqual<InlineCompletionItem>(item)
    })

    test('handles non-empty currentLineSuffix', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█)')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                currentLineSuffix: ')',
            })
        ).toEqual<InlineCompletionItem>({
            ...item,
            range: range(0, 14, 0, 15),
        })
    })

    test('handles whitespace in currentLineSuffix', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█)')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                currentLineSuffix: ') ',
            })
        ).toEqual<InlineCompletionItem>({
            ...item,
            range: range(0, 14, 0, 16),
        })
    })
})

describe('process completion item', () => {
    let parser: Parser

    beforeAll(async () => {
        parser = await initTreeSitterParser()
    })

    function processCompletions(code: string, completionSnippets: string[]) {
        const { document, position } = documentAndPosition(code)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: Infinity,
            maxSuffixLength: Infinity,
            enableExtendedTriggers: true,
        })

        updateParseTreeCache(document, parser)

        return processInlineCompletions(
            completionSnippets.map(s => ({ insertText: s })),
            {
                document,
                position,
                docContext,
            }
        )
    }

    test('adds parse info to single-line completions', () => {
        const completions = processCompletions('function sort(█', ['array) {}', 'array) new'])

        expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
    })

    test('respects completion insert ranges', () => {
        const completions = processCompletions('function sort(█)', ['array) {}', 'array) new'])

        expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
    })

    test('adds parse info to multi-line completions', () => {
        const completions = processCompletions(
            `
            function hello() {
                alert('hello world!')
            }

            const one = []; function sort(█)
        `,
            ['array) {\nreturn array.sort()\n} function two() {}', 'array) new\n']
        )

        expect(completions).toMatchInlineSnapshot(`
          [
            {
              "insertText": "array) {",
              "nodeTypes": {
                "atCursor": "identifier",
                "grandGrandParent": "function_declaration",
                "grandParent": "formal_parameters",
                "parent": "required_parameter",
              },
              "parseErrorCount": 0,
              "range": {
                "end": Position {
                  "character": 43,
                  "line": 5,
                },
                "start": Position {
                  "character": 42,
                  "line": 5,
                },
              },
            },
            {
              "insertText": "array) new",
              "nodeTypes": {
                "atCursor": "identifier",
                "grandGrandParent": "ERROR",
                "grandParent": "formal_parameters",
                "parent": "required_parameter",
              },
              "parseErrorCount": 1,
              "range": {
                "end": Position {
                  "character": 43,
                  "line": 5,
                },
                "start": Position {
                  "character": 42,
                  "line": 5,
                },
              },
            },
          ]
        `)
    })

    test('truncates multi-line if statements correctly', () => {
        const completions = processCompletions(
            `
            function whatever() {
                console.log(123)
            }
            console.log(321); if (check) {
                █
            }
        `,
            [
                dedent`console.log('one')
                    } else {
                        console.log('two')
                    } else {
                        console.log('three')
                    }
            `,
            ]
        )

        expect(completions).toMatchInlineSnapshot(`
          [
            {
              "insertText": "console.log('one')
          } else {
              console.log('two')
          }",
              "lineTruncatedCount": 2,
              "nodeTypes": {
                "atCursor": "{",
                "grandGrandParent": "program",
                "grandParent": "if_statement",
                "parent": "statement_block",
              },
              "parseErrorCount": 0,
              "truncatedWith": "tree-sitter",
            },
          ]
        `)
    })
})

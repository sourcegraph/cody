import dedent from 'dedent'
import { beforeAll, describe, expect, it } from 'vitest'
import Parser from 'web-tree-sitter'

import { range } from '../../testutils/textDocument'
import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition, initTreeSitterParser } from '../test-helpers'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

import { adjustRangeToOverwriteOverlappingCharacters, processInlineCompletions } from './process-inline-completions'

describe('adjustRangeToOverwriteOverlappingCharacters', () => {
    it('no adjustment at end of line', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                currentLineSuffix: '',
            })
        ).toEqual<InlineCompletionItem>(item)
    })

    it('handles non-empty currentLineSuffix', () => {
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

    it('handles whitespace in currentLineSuffix', () => {
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
            completionSnippets.map(s => ({ content: s, stopReason: 'unknown' })),
            {
                document,
                position,
                docContext,
            }
        )
    }

    it('adds parse info to single-line completions', () => {
        const completions = processCompletions('function sort(█', ['array) {}', 'array) new'])

        expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
    })

    it('respects completion insert ranges', () => {
        const completions = processCompletions('function sort(█)', ['array) {}', 'array) new'])

        expect(completions.map(c => Boolean(c.parseErrorCount))).toEqual([false, true])
    })

    it('adds parse info to multi-line completions', () => {
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
                "atCursor": "(",
                "grandparent": "function_signature",
                "greatGrandparent": "program",
                "parent": "formal_parameters",
              },
              "nodeTypesWithCompletion": {
                "atCursor": "(",
                "grandparent": "function_declaration",
                "greatGrandparent": "program",
                "parent": "formal_parameters",
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
              "stopReason": "unknown",
            },
            {
              "insertText": "array) new",
              "nodeTypes": {
                "atCursor": "(",
                "grandparent": "function_signature",
                "greatGrandparent": "program",
                "parent": "formal_parameters",
              },
              "nodeTypesWithCompletion": {
                "atCursor": "(",
                "grandparent": "ERROR",
                "greatGrandparent": "program",
                "parent": "formal_parameters",
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
              "stopReason": "unknown",
            },
          ]
        `)
    })

    it('truncates multi-line if statements correctly', () => {
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
                "atCursor": "statement_block",
                "grandparent": "program",
                "greatGrandparent": undefined,
                "parent": "if_statement",
              },
              "nodeTypesWithCompletion": {
                "atCursor": "statement_block",
                "grandparent": "program",
                "greatGrandparent": undefined,
                "parent": "if_statement",
              },
              "parseErrorCount": 0,
              "stopReason": "unknown",
              "truncatedWith": "tree-sitter",
            },
          ]
        `)
    })

    it('adds parse info to single-line completions', () => {
        const completions = processCompletions(
            `
            const one = █
        `,
            ['"one"']
        )

        expect(completions).toMatchInlineSnapshot(`
          [
            {
              "insertText": "\\"one\\"",
              "nodeTypes": {
                "atCursor": "program",
                "grandparent": undefined,
                "greatGrandparent": undefined,
                "parent": undefined,
              },
              "nodeTypesWithCompletion": {
                "atCursor": "variable_declarator",
                "grandparent": "program",
                "greatGrandparent": undefined,
                "parent": "lexical_declaration",
              },
              "parseErrorCount": 0,
              "stopReason": "unknown",
            },
          ]
        `)
    })
})

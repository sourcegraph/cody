import { beforeAll, describe, expect, test } from 'vitest'
import Parser from 'web-tree-sitter'

import { range } from '../../testutils/textDocument'
import { getCurrentDocContext } from '../get-current-doc-context'
import { documentAndPosition, initTreeSitterParser } from '../test-helpers'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { InlineCompletionItem } from '../types'

import { adjustRangeToOverwriteOverlappingCharacters, processItem } from './process-inline-completions'

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

describe('parseCompletion', () => {
    let parser: Parser

    beforeAll(async () => {
        parser = await initTreeSitterParser()
    })

    function testParseInfoProcessor(code: string, completioSnippets: string[]) {
        const { document, position } = documentAndPosition(code)
        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: Infinity,
            maxSuffixLength: Infinity,
            enableExtendedTriggers: true,
        })

        updateParseTreeCache(document, parser)

        return completioSnippets.map(insertText =>
            processItem({ insertText }, { document, position, multiline: insertText.includes('\n'), docContext })
        )
    }

    test('adds parse info to single-line completions', () => {
        const completions = testParseInfoProcessor('function sort(█', ['array) {}', 'array) new'])

        expect(completions.map(c => c.hasParseErrors)).toEqual([false, true])
    })

    test('respects completion insert ranges', () => {
        const completions = testParseInfoProcessor('function sort(█)', ['array) {}', 'array) new'])

        expect(completions.map(c => c.hasParseErrors)).toEqual([false, true])
    })

    test('adds parse info to multi-line completions', () => {
        const completions = testParseInfoProcessor(
            `
            function hello() {
                alert('hello world!')
            }

            function sort(█)
        `,
            ['array) {\nreturn array.sort()\n}', 'array) new\n']
        )

        expect(completions.map(c => c.hasParseErrors)).toEqual([false, true])
    })
})

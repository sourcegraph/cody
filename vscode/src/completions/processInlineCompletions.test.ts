import { describe, expect, test } from 'vitest'

import { range } from '../testutils/textDocument'

import { adjustRangeToOverwriteOverlappingCharacters } from './processInlineCompletions'
import { documentAndPosition } from './testHelpers'
import { InlineCompletionItem } from './types'

describe('adjustRangeToOverwriteOverlappingCharacters', () => {
    test('no adjustment at end of line', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                docContext: { currentLineSuffix: '' },
            })
        ).toEqual<InlineCompletionItem>(item)
    })

    test('handles non-empty currentLineSuffix', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█)')
        expect(
            adjustRangeToOverwriteOverlappingCharacters(item, {
                position,
                docContext: { currentLineSuffix: ')' },
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
                docContext: { currentLineSuffix: ') ' },
            })
        ).toEqual<InlineCompletionItem>({
            ...item,
            range: range(0, 14, 0, 16),
        })
    })
})

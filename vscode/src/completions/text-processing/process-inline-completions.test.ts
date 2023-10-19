import { describe, expect, it } from 'vitest'

import { range } from '../../testutils/textDocument'
import { documentAndPosition } from '../test-helpers'
import { InlineCompletionItem } from '../types'

import { getRangeAdjustedForOverlappingCharacters } from './process-inline-completions'

describe('adjustRangeToOverwriteOverlappingCharacters', () => {
    it('no adjustment at end of line', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█')
        expect(
            getRangeAdjustedForOverlappingCharacters(item, {
                position,
                currentLineSuffix: '',
            })
        ).toBeUndefined()
    })

    it('handles non-empty currentLineSuffix', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█)')
        expect(
            getRangeAdjustedForOverlappingCharacters(item, {
                position,
                currentLineSuffix: ')',
            })
        ).toEqual<InlineCompletionItem['range']>(range(0, 14, 0, 15))
    })

    it('handles whitespace in currentLineSuffix', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { position } = documentAndPosition('function sort(█)')
        expect(
            getRangeAdjustedForOverlappingCharacters(item, {
                position,
                currentLineSuffix: ') ',
            })
        ).toEqual<InlineCompletionItem['range']>(range(0, 14, 0, 16))
    })
})

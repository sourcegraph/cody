import { describe, expect, it } from 'vitest'

import type { Range } from '../../testutils/mocks'
import { range } from '../../testutils/textDocument'
import { documentAndPosition } from '../test-helpers'
import type { InlineCompletionItem } from '../types'

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

    it('no adjustment if completion does not match current line suffix', () => {
        const item: InlineCompletionItem = { insertText: '"argument1", true' }
        const { position } = documentAndPosition('myFunction(█)')
        expect(
            getRangeAdjustedForOverlappingCharacters(item, {
                position,
                currentLineSuffix: ')',
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

    it('handles partial currentLineSuffix match', () => {
        const item: InlineCompletionItem = { insertText: 'array) {' }
        const { document, position } = documentAndPosition('function sort(█) {}')
        const replaceRange = getRangeAdjustedForOverlappingCharacters(item, {
            position,
            currentLineSuffix: ') {}',
        })

        expect(document.getText(replaceRange as Range)).toEqual(') {')
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

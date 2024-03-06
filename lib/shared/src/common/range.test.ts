import { describe, expect, test } from 'vitest'
import { toRangeData } from './range'

describe('toRangeData', () => {
    test('converts Range to RangeData', () => {
        expect(
            toRangeData({ start: { line: 1, character: 2 }, end: { line: 3, character: 4 } })
        ).toEqual({
            start: { line: 1, character: 2 },
            end: { line: 3, character: 4 },
        })
    })

    test('handles array input', () => {
        expect(
            toRangeData([
                { line: 1, character: 2 },
                { line: 3, character: 4 },
            ])
        ).toEqual({
            start: { line: 1, character: 2 },
            end: { line: 3, character: 4 },
        })
    })

    test('handles undefined input', () => {
        expect(toRangeData(undefined)).toBeUndefined()
    })
})

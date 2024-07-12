import { describe, expect, test } from 'vitest'
import { displayLineRange, displayRange, expandToLineRange, toRangeData } from './range'

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

describe('displayRangeLines', () => {
    test('multi-line range', () =>
        expect(
            displayLineRange({
                start: { line: 1, character: 2 },
                end: { line: 4, character: 5 },
            }).toString()
        ).toBe('2-5'))

    test('range ending at character 0', () =>
        expect(
            displayLineRange({
                start: { line: 1, character: 2 },
                end: { line: 4, character: 0 },
            }).toString()
        ).toBe('2-4'))

    test('single line only', () => {
        expect(
            displayLineRange({
                start: { line: 1, character: 0 },
                end: { line: 1, character: 0 },
            }).toString()
        ).toBe('2')
        expect(
            displayLineRange({
                start: { line: 1, character: 0 },
                end: { line: 1, character: 17 },
            }).toString()
        ).toBe('2')
        expect(
            displayLineRange({
                start: { line: 1, character: 2 },
                end: { line: 2, character: 0 },
            }).toString()
        ).toBe('2')
    })
})

describe('displayRange', () => {
    test('same line', () =>
        expect(
            displayRange({ start: { line: 1, character: 2 }, end: { line: 1, character: 5 } }).toString()
        ).toBe('2:3-6'))

    test('empty', () =>
        expect(
            displayRange({ start: { line: 1, character: 2 }, end: { line: 1, character: 2 } }).toString()
        ).toBe('2:3'))

    test('multi-line range', () =>
        expect(
            displayRange({ start: { line: 1, character: 2 }, end: { line: 3, character: 4 } }).toString()
        ).toBe('2:3-4:5'))
})
describe('expandToLineRange', () => {
    test('expands range to whole line', () => {
        const input = { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } }
        const expected = { start: { line: 1, character: 0 }, end: { line: 4, character: 0 } }
        expect(expandToLineRange(input)).toEqual(expected)
    })

    test('handles range with end character at 0', () => {
        const input = { start: { line: 1, character: 2 }, end: { line: 3, character: 0 } }
        const expected = { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } }
        expect(expandToLineRange(input)).toEqual(expected)
    })

    test('expands single-line range', () => {
        const input = { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } }
        const expected = { start: { line: 5, character: 0 }, end: { line: 6, character: 0 } }
        expect(expandToLineRange(input)).toEqual(expected)
    })

    test('handles zero-width range', () => {
        const input = { start: { line: 7, character: 15 }, end: { line: 7, character: 15 } }
        const expected = { start: { line: 7, character: 0 }, end: { line: 8, character: 0 } }
        expect(expandToLineRange(input)).toEqual(expected)
    })

    test('expands range spanning multiple lines', () => {
        const input = { start: { line: 10, character: 5 }, end: { line: 15, character: 8 } }
        const expected = { start: { line: 10, character: 0 }, end: { line: 16, character: 0 } }
        expect(expandToLineRange(input)).toEqual(expected)
    })
})

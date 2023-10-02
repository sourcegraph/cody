import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { findTargetFoldingRange, getTargetRange } from './folding-ranges'

describe('getTargetRange', () => {
    it('returns outermost folding range containing cursor', () => {
        const classRanges = [] as vscode.Range[]
        const foldingRanges = [
            { start: 0, end: 10 },
            { start: 2, end: 5 },
            { start: 6, end: 9 },
        ]
        const cursorPos = 7
        const expected = { start: 0, end: 10 }

        expect(getTargetRange(classRanges, foldingRanges, cursorPos)).toEqual(expected)
    })

    it('filters out folding ranges contained in class ranges', () => {
        const classRanges = [{ start: { line: 0 }, end: { line: 10 } }] as vscode.Range[]
        const foldingRanges = [
            { start: 0, end: 10 },
            { start: 2, end: 5 },
        ]
        const cursorPos = 7
        const expected = undefined

        expect(getTargetRange(classRanges, foldingRanges, cursorPos)).toEqual(expected)
    })

    it('returns undefined if no range contains cursor', () => {
        const classRanges = [] as vscode.Range[]
        const foldingRanges = [
            { start: 0, end: 5 },
            { start: 10, end: 15 },
        ]
        const cursorPos = 7

        expect(getTargetRange(classRanges, foldingRanges, cursorPos)).toBeUndefined()
    })

    it('returns parent range when cursor is inside nested child range', () => {
        const foldingRanges = [
            { start: 0, end: 10 },
            { start: 2, end: 5 },
        ]
        const cursorPos = 3
        const expected = { start: 0, end: 10 }

        expect(getTargetRange([], foldingRanges, cursorPos)).toEqual(expected)
    })

    it('returns undefined if cursor is outside all ranges', () => {
        const foldingRanges = [
            { start: 0, end: 5 },
            { start: 10, end: 15 },
        ]
        const cursorPos = 20

        expect(getTargetRange([], foldingRanges, cursorPos)).toBeUndefined()
    })
})

describe('findTargetFoldingRange', () => {
    it('returns range containing target', () => {
        const ranges = [
            { start: 0, end: 10 },
            { start: 20, end: 30 },
        ]
        const target = 5

        const result = findTargetFoldingRange(ranges, target)

        expect(result).toEqual({ start: 0, end: 10 })
    })

    it('returns undefined if no range contains target', () => {
        const ranges = [
            { start: 0, end: 10 },
            { start: 20, end: 30 },
        ]
        const target = 15

        const result = findTargetFoldingRange(ranges, target)

        expect(result).toBeUndefined()
    })
})

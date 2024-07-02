import { describe, expect, it } from 'vitest'

import { Position, Range, Selection } from './mocks'

describe('VS Code Mocks', () => {
    describe('Range', () => {
        it('constructor(Position,Position)', () => {
            const start = new Position(1, 2)
            const end = new Position(2, 3)
            const selection = new Range(start, end)
            expect(selection.start).toStrictEqual(start)
            expect(selection.end).toStrictEqual(end)
        })

        it('constructor(number,number)', () => {
            const selection = new Selection(1, 2, 3, 4)
            expect(selection.start.line).toStrictEqual(1)
            expect(selection.start.character).toStrictEqual(2)
            expect(selection.end.line).toStrictEqual(3)
            expect(selection.end.character).toStrictEqual(4)
        })

        it('intersection(otherRange)', () => {
            // Matching ranges intersect and produce the same ranges
            const rangeA = new Range(0, 0, 4, 0)
            const rangeB = new Range(0, 0, 4, 0)
            expect(rangeA.intersection(rangeB)).toStrictEqual(rangeA)

            // Overlapping ranges intersect and produce the overlapping range
            const rangeC = new Range(2, 0, 6, 0)
            expect(rangeA.intersection(rangeC)).toStrictEqual(new Range(2, 0, 4, 0))

            // Non-overlapping ranges do not intersect and return undefined
            const rangeD = new Range(99, 0, 100, 0)
            expect(rangeA.intersection(rangeD)).toBeUndefined()
        })
    })
    describe('Selection', () => {
        it('constructor(Position,Position)', () => {
            const anchor = new Position(1, 2)
            const active = new Position(2, 3)
            const selection = new Selection(anchor, active)
            expect(selection.anchor).toStrictEqual(anchor)
            expect(selection.start).toStrictEqual(selection.anchor)
            expect(selection.active).toStrictEqual(active)
            expect(selection.end).toStrictEqual(selection.active)
        })
        it('constructor(number,number)', () => {
            const selection = new Selection(1, 2, 3, 4)
            expect(selection.start.line).toStrictEqual(1)
            expect(selection.start.character).toStrictEqual(2)
            expect(selection.end.line).toStrictEqual(3)
            expect(selection.end.character).toStrictEqual(4)
        })
    })
})

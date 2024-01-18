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

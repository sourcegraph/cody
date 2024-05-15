import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { expandRangeToInsertedText, getMinimumDistanceToRangeBoundary } from './utils'

describe('getMinimumDistanceToRangeBoundary', () => {
    it('returns start distance when position is before range', () => {
        const position = new vscode.Position(5, 0)
        const range = new vscode.Range(10, 0, 20, 0)
        const minDistance = getMinimumDistanceToRangeBoundary(position, range)
        expect(minDistance).toBe(5)
    })

    it('returns end distance when position is after range', () => {
        const position = new vscode.Position(25, 0)
        const range = new vscode.Range(10, 0, 20, 0)
        const minDistance = getMinimumDistanceToRangeBoundary(position, range)
        expect(minDistance).toBe(5)
    })

    it('returns smaller of start and end distances when position is in range', () => {
        const position = new vscode.Position(18, 0)
        const range = new vscode.Range(10, 0, 20, 0)
        const minDistance = getMinimumDistanceToRangeBoundary(position, range)
        expect(minDistance).toBe(2)
    })
})

describe('expandRangeToInsertedText', () => {
    it('should expand range with additional characters', () => {
        const range = new vscode.Range(0, 0, 0, 0)
        const insertedText = 'Hello, world'
        const adjustedRange = expandRangeToInsertedText(range, insertedText)
        const expectedRange = new vscode.Range(0, 0, 0, 12)
        expect(adjustedRange.isEqual(expectedRange)).toBe(true)
    })

    it('should expand range with additional characters and new lines', () => {
        const range = new vscode.Range(10, 0, 10, 0)
        const insertedText = 'Hello, world\nWorld, Hello'
        const adjustedRange = expandRangeToInsertedText(range, insertedText)
        const expectedRange = new vscode.Range(10, 0, 11, 12)
        expect(adjustedRange.isEqual(expectedRange)).toBe(true)
    })
})

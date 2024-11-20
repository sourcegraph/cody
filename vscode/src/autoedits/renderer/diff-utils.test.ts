import { describe, expect, it } from 'vitest'
import { getLineLevelDiff } from './diff-utils'

describe('getLineLevelDiff', () => {
    it('should identify modified lines', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const predictedLines = ['line1', 'modified2', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([{ oldNumber: 1, newNumber: 1 }])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 2, newNumber: 2 }
        ])
    })

    it('should identify added lines', () => {
        const currentLines = ['line1', 'line2']
        const predictedLines = ['line1', 'line2', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([2])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 1, newNumber: 1 }
        ])
    })

    it('should identify removed lines', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const predictedLines = ['line1', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([1])
        expect(result.unchangedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 2, newNumber: 1 }
        ])
    })

    it('should handle changes with modified lines', () => {
        const currentLines = ['line1', 'line2', 'line3', 'line4']
        const predictedLines = ['line1', 'modified2', 'newline', 'line4']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([
            { oldNumber: 1, newNumber: 1 },
            { oldNumber: 2, newNumber: 2 }
        ])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 3, newNumber: 3 }
        ])
    })

    it('should handle empty input arrays', () => {
        const result = getLineLevelDiff([], [])

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([])
    })

    it('should handle multiple modifications, additions and removals', () => {
        const currentLines = ['keep1', 'remove1', 'modify1', 'keep2', 'remove2', 'modify2', 'keep3']
        const predictedLines = ['keep1', 'modified1', 'keep2', 'add1', 'modified2', 'add2', 'keep3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        // Modified lines track both old and new line numbers
        expect(result.modifiedLines).toEqual([
            { oldNumber: 1, newNumber: 1 },
            { oldNumber: 4, newNumber: 3 },
            { oldNumber: 5, newNumber: 4 }
        ])

        // Added lines are tracked by their line number in the new text
        expect(result.addedLines).toEqual([5])

        // Removed lines are tracked by their line number in the original text
        expect(result.removedLines).toEqual([2])

        // Unchanged lines track both old and new line numbers
        expect(result.unchangedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 3, newNumber: 2 },
            { oldNumber: 6, newNumber: 6 }
        ])
    })

    it('should handle completely different content', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const predictedLines = ['different1', 'different2', 'different3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 1, newNumber: 1 },
            { oldNumber: 2, newNumber: 2 }
        ])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([])
    })

    it('should handle one empty array', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const emptyLines: string[] = []

        const result = getLineLevelDiff(currentLines, emptyLines)

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([0, 1, 2])
        expect(result.unchangedLines).toEqual([])

        const result2 = getLineLevelDiff(emptyLines, currentLines)

        expect(result2.modifiedLines).toEqual([])
        expect(result2.addedLines).toEqual([0, 1, 2])
        expect(result2.removedLines).toEqual([])
        expect(result2.unchangedLines).toEqual([])
    })

    it('should handle arrays with only whitespace differences', () => {
        const currentLines = ['  line1', 'line2  ', ' line3 ']
        const predictedLines = ['line1', 'line2', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([
            { oldNumber: 0, newNumber: 0 },
            { oldNumber: 1, newNumber: 1 },
            { oldNumber: 2, newNumber: 2 }
        ])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
        expect(result.unchangedLines).toEqual([])
    })
})

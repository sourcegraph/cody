import { describe, expect, it } from 'vitest'
import { getLineLevelDiff } from './diff-utils'

describe('getLineLevelDiff', () => {
    it('should identify modified lines', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const predictedLines = ['line1', 'modified2', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([{ beforeNumber: 1, afterNumber: 1 }])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
    })

    it('should identify added lines', () => {
        const currentLines = ['line1', 'line2']
        const predictedLines = ['line1', 'line2', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([2])
        expect(result.removedLines).toEqual([])
    })

    it('should identify removed lines', () => {
        const currentLines = ['line1', 'line2', 'line3']
        const predictedLines = ['line1', 'line3']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([1])
    })

    it('should handle changes with modified lines', () => {
        const currentLines = ['line1', 'line2', 'line3', 'line4']
        const predictedLines = ['line1', 'modified2', 'newline', 'line4']

        const result = getLineLevelDiff(currentLines, predictedLines)

        expect(result.modifiedLines).toEqual([
            { beforeNumber: 1, afterNumber: 1 },
            { beforeNumber: 2, afterNumber: 2 },
        ])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
    })

    it('should handle empty input arrays', () => {
        const result = getLineLevelDiff([], [])

        expect(result.modifiedLines).toEqual([])
        expect(result.addedLines).toEqual([])
        expect(result.removedLines).toEqual([])
    })
})

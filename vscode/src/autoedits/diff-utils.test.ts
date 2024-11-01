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

// describe('getModifiedRangesForLine', () => {
//     it('should detect single character addition', () => {
//         const result = getModifiedRangesForLine('hello', 'hello!')
//         expect(result).toEqual([
//             { from1: 5, to1: 5, from2: 5, to2: 6 }
//         ])
//     })

//     it('should detect single character deletion', () => {
//         const result = getModifiedRangesForLine('hello!', 'hello')
//         expect(result).toEqual([
//             { from1: 5, to1: 6, from2: 5, to2: 5 }
//         ])
//     })

//     it('should detect multiple character addition', () => {
//         const result = getModifiedRangesForLine('hello', 'hello world')
//         expect(result).toEqual([
//             { from1: 5, to1: 5, from2: 5, to2: 11 }
//         ])
//     })

//     it('should detect multiple character deletion', () => {
//         const result = getModifiedRangesForLine('hello world', 'hello')
//         expect(result).toEqual([
//             { from1: 5, to1: 11, from2: 5, to2: 5 }
//         ])
//     })

//     it('should handle empty strings', () => {
//         const result = getModifiedRangesForLine('', '')
//         expect(result).toEqual([])
//     })

//     it('should handle completely different strings', () => {
//         const result = getModifiedRangesForLine('abc', 'xyz')
//         expect(result).toEqual([
//             { from1: 0, to1: 3, from2: 0, to2: 3 }
//         ])
//     })
// })

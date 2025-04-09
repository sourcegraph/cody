import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { documentAndPosition } from '../../../completions/test-helpers'
import {
    AutoeditStopReason,
    type PartialModelResponse,
    type SuccessModelResponse,
} from '../../adapters/base'
import { createCodeToReplaceDataForTest } from '../../prompt/test-helper'
import { type SuggestedDiff, getSuggestedDiffForChunk } from './suggested-diff'
import { type TrimPredictionForHotStreakResult, trimPredictionForHotStreak } from './trim-prediction'

const MOCK_EXISTING_CODE = `
export function isEvenOrOdd(numberToChange: number): boolean {█
    // Check if numberToChange is 0
    if (numberToChange === 0) {
        return true
    }
    throw new Error('Out of RAM')
}\n`.trimStart()

function createSuggestedResponse(
    prediction: string,
    type: 'success' | 'partial'
): SuccessModelResponse | PartialModelResponse {
    return {
        type,
        stopReason: AutoeditStopReason.HotStreak,
        prediction,
        requestUrl: 'https://test.com',
        responseHeaders: {},
        responseBody: {},
    }
}

function createTestParams({
    responseType,
    responsePrediction,
}: {
    responseType: 'success' | 'partial'
    responsePrediction: string
}): { response: SuccessModelResponse | PartialModelResponse; chunk: TrimPredictionForHotStreakResult } {
    const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
    })
    const codeToReplaceData = createCodeToReplaceDataForTest(MOCK_EXISTING_CODE, {
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 30,
    })

    const response = createSuggestedResponse(responsePrediction, responseType)
    return {
        response,
        chunk: trimPredictionForHotStreak({
            latestFullPrediction: responsePrediction,
            processedPrediction: '',
            document,
            docContext,
            position,
            codeToReplaceData,
            response,
        }) as TrimPredictionForHotStreakResult,
    }
}

describe('getSuggestedDiffForChunk', () => {
    describe('rejected scenarios', () => {
        it('rejects a partial prediction that has no changes', () => {
            const { response, chunk } = createTestParams({
                responseType: 'partial',
                // Response prediction, last line is a change
                responsePrediction: dedent`
                    export function isEvenOrOdd(numberToChange: number): boolean {
                        // Check if numberToChange is 0\n
                `,
            })
            const result = getSuggestedDiffForChunk(response, chunk)
            expect(result).toBe(null)
        })

        it('rejects a partial prediction that ends in a modified line', () => {
            const { response, chunk } = createTestParams({
                responseType: 'partial',
                // Response prediction, last line is a change
                responsePrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0\n
                `,
            })
            const result = getSuggestedDiffForChunk(response, chunk)
            expect(result).toBe(null)
        })
    })

    describe('accepted scenarios', () => {
        it('accepts a partial prediction that ends in an unchanged line', () => {
            const { response, chunk } = createTestParams({
                responseType: 'partial',
                // Response prediction, last line is unchanged
                responsePrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true\n
                `,
            })
            const result = getSuggestedDiffForChunk(response, chunk) as SuggestedDiff
            expect(result.firstChange).toEqual({
                // We modified the parameter in the first line
                type: 'modified',
                lineNumber: 0,
            })
            expect(result.lastChange).toEqual({
                // We modified `numberToChange === 0` to `target === 0`
                type: 'modified',
                lineNumber: 2,
            })
        })

        it('accepts a full prediction', () => {
            const { response, chunk } = createTestParams({
                responseType: 'success',
                // Response prediction, last line is unchanged
                responsePrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }
                        throw new Error('Out of RAM')
                    }\n
                `,
            })
            const result = getSuggestedDiffForChunk(response, chunk) as SuggestedDiff
            expect(result.firstChange).toEqual({
                // We modified the parameter in the first line
                type: 'modified',
                lineNumber: 0,
            })
            expect(result.lastChange).toEqual({
                // We modified `numberToChange === 0` to `target === 0`
                type: 'modified',
                lineNumber: 2,
            })
        })

        it('accepts a full prediction even if the last line is changed', () => {
            const { response, chunk } = createTestParams({
                responseType: 'success',
                // Response prediction, last line is unchanged
                responsePrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }
                        throw new Error('Out of RAM')
                    }.CHANGED\n
                `,
            })
            const result = getSuggestedDiffForChunk(response, chunk) as SuggestedDiff
            expect(result.firstChange).toEqual({
                // We modified the parameter in the first line
                type: 'modified',
                lineNumber: 0,
            })
            expect(result.lastChange).toEqual({
                // Last line was changed
                // We modified `}` to `}.CHANGED`
                type: 'modified',
                lineNumber: 6,
            })
        })
    })
})

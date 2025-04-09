import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { documentAndPosition } from '../../../completions/test-helpers'
import { AutoeditStopReason, PartialModelResponse, SuccessModelResponse } from '../../adapters/base'
import { createCodeToReplaceDataForTest } from '../../prompt/test-helper'
import {
    type TrimPredictionForHotStreakParams,
    type TrimPredictionForHotStreakResult,
    trimPredictionForHotStreak,
} from './trim-prediction'

const MOCK_EXISTING_CODE = `
export function isEvenOrOdd(numberToChange: number): boolean {█
    // Check if numberToChange is 0
    if (numberToChange === 0) {
        return true
    }
    throw new Error('Out of RAM')
}`.trim()

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
    latestFullPrediction,
    processedPrediction,
    responseType = 'partial',
}: {
    latestFullPrediction: string
    processedPrediction: string
    responseType?: 'success' | 'partial'
}): TrimPredictionForHotStreakParams {
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

    return {
        latestFullPrediction,
        processedPrediction,
        document,
        position,
        codeToReplaceData,
        docContext,
        response: createSuggestedResponse(latestFullPrediction, responseType),
    }
}

describe('trimPredictionForHotStreak', () => {
    describe('no useful predictions', () => {
        it('handles no latest prediction and no processed prediction', () => {
            const emptyPrediction = createTestParams({
                latestFullPrediction: '',
                processedPrediction: '',
            })
            const result = trimPredictionForHotStreak(emptyPrediction)
            expect(result).toBe(null)
        })

        it('handles no latest prediction and a processed prediction', () => {
            const emptyPrediction = createTestParams({
                latestFullPrediction: '',
                processedPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }
                `,
            })
            const result = trimPredictionForHotStreak(emptyPrediction)
            expect(result).toBe(null)
        })
    })

    describe('partial predictions', () => {
        it('handles a partial prediction that results in no useful prediction', () => {
            const partialPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenO
                `,
                processedPrediction: '',
            })
            const result = trimPredictionForHotStreak(partialPrediction)
            expect(result).toBe(null)
        })

        it('handles a partial prediction that results in no useful prediction due to the processed prediction', () => {
            const partialPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if tar
                `,
                processedPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {\n
                `,
            })
            const result = trimPredictionForHotStreak(partialPrediction)
            expect(result).toBe(null)
        })

        it('handles a partial prediction that still results in a useful prediction', () => {
            const partialPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if tar
                `,
                processedPrediction: '',
            })
            const result = trimPredictionForHotStreak(
                partialPrediction
            ) as TrimPredictionForHotStreakResult
            expect(result.range).toEqual(new vscode.Range(0, 0, 1, 0))
            expect(result.text).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(target: number): boolean {
              "
            `)
            expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(numberToChange: number): boolean {
              "
            `)
            expect(result.docContext.prefix + result.docContext.suffix).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(numberToChange: number): boolean {
                  // Check if numberToChange is 0
                  if (numberToChange === 0) {
                      return true
                  }
                  throw new Error('Out of RAM')
              }"
            `)
        })
    })

    describe('useful predictions', () => {
        it('handles a first prediction', () => {
            const fullPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }\n
                `,
                processedPrediction: '',
            })
            const result = trimPredictionForHotStreak(fullPrediction) as TrimPredictionForHotStreakResult
            expect(result.range).toEqual(new vscode.Range(0, 0, 5, 0))
            expect(result.text).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(target: number): boolean {
                  // Check if target is 0
                  if (target === 0) {
                      return true
                  }
              "
            `)
            expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(numberToChange: number): boolean {
                  // Check if numberToChange is 0
                  if (numberToChange === 0) {
                      return true
                  }
              "
            `)
            expect(result.docContext.prefix + result.docContext.suffix).toMatchInlineSnapshot(`
                "export function isEvenOrOdd(numberToChange: number): boolean {
                    // Check if numberToChange is 0
                    if (numberToChange === 0) {
                        return true
                    }
                    throw new Error('Out of RAM')
                }"
              `)
        })

        it('handles a second prediction', () => {
            const fullPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }\n
                `,
                processedPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0\n
                `,
            })
            const result = trimPredictionForHotStreak(fullPrediction) as TrimPredictionForHotStreakResult
            expect(result.range).toEqual(new vscode.Range(2, 0, 5, 0))
            expect(result.text).toMatchInlineSnapshot(`
              "    if (target === 0) {
                      return true
                  }
              "
            `)
            expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
              "    if (numberToChange === 0) {
                      return true
                  }
              "
            `)
            expect(result.docContext.prefix + result.docContext.suffix).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(target: number): boolean {
                  // Check if target is 0
                  if (numberToChange === 0) {
                      return true
                  }
                  throw new Error('Out of RAM')
              }"
            `)
        })

        it('handles a completed prediction on a succcess response', () => {
            const fullPrediction = createTestParams({
                latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }
                        throw new Error('Out of RAM')
                    }
                `,
                processedPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0\n
                `,
                responseType: 'partial',
            })
            const result = trimPredictionForHotStreak(fullPrediction) as TrimPredictionForHotStreakResult
            expect(result.range).toEqual(new vscode.Range(2, 0, 6, 0))
            expect(result.text).toMatchInlineSnapshot(`
              "    if (target === 0) {
                      return true
                  }
                  throw new Error('Out of RAM')
              "
            `)
            expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
              "    if (numberToChange === 0) {
                      return true
                  }
                  throw new Error('Out of RAM')
              "
            `)
            expect(result.docContext.prefix + result.docContext.suffix).toMatchInlineSnapshot(`
              "export function isEvenOrOdd(target: number): boolean {
                  // Check if target is 0
                  if (numberToChange === 0) {
                      return true
                  }
                  throw new Error('Out of RAM')
              }"
            `)
        })
    })
})

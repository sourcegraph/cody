import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import dedent from 'dedent'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import {
    AutoeditStopReason,
    type PartialModelResponse,
    type SuccessModelResponse,
} from '../adapters/base'
import { createCodeToReplaceDataForTest } from '../prompt/test-helper'
import { type GetHotStreakChunkParams, type HotStreakChunk, getHotStreakChunk } from './get-chunk'

const MOCK_EXISTING_CODE = `
█export function isEvenOrOdd(numberToChange: number): boolean {
    // Check if numberToChange is 0
    if (numberToChange === 0) {
        return true
    }

    // Check if numberToChange is 1
    if (numberToChange === 1) {
        return false
    }

    // Check if numberToChange is 2
    if (numberToChange === 2) {
        return true
    }

    // Check if numberToChange is 3
    if (numberToChange === 3) {
        return false
    }

    // Check if numberToChange is 4
    if (numberToChange === 4) {
        return true
    }

    // Check if numberToChange is 5
    if (numberToChange === 5) {
        return false
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
    document,
    position,
    latestFullPrediction,
    processedPrediction,
    responseType = 'partial',
}: {
    document: vscode.TextDocument
    position: vscode.Position
    latestFullPrediction: string
    processedPrediction: string
    responseType?: 'success' | 'partial'
}): GetHotStreakChunkParams {
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

describe('getHotStreakChunk', () => {
    it('no latest prediction and no processed prediction', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: '',
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params)
        expect(result).toBe(null)
    })

    it('no latest prediction with a processed prediction', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: '',
            processedPrediction: dedent`
                    export function isEvenOrOdd(numberToChange: number): boolean {
                        // Check if numberToChange is 0
                        if (numberToChange === 0) {
                            return true
                        }

                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
                `,
        })
        const result = getHotStreakChunk(params)
        expect(result).toBe(null)
    })

    it('prediction with no changes', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                    export function isEvenOrOdd(numberToChange: number): boolean {
                        // Check if numberToChange is 0
                        if (numberToChange === 0) {
                            return true
                        }

                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
                `,
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params)
        expect(result).toBe(null)
    })

    it('prediction with no changes but with changes in the processed prediction', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
                `,
            processedPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }\n
                \n
                `,
        })
        const result = getHotStreakChunk(params)
        expect(result).toBe(null)
    })

    it('prediction with simple modifications within the range', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }\n
                `,
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params) as HotStreakChunk
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
    })

    it('prediction with lines added within the range', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }

                        // We are adding some commments
                        // To make a ...wonderful diff!

                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
                `,
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params) as HotStreakChunk
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
    })

    it('prediction with lines added before the range', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                    export function log(message: string) {
                        // Log a message
                        console.log(message)
                    }

                    export function isEvenOrOdd(numberToChange: number): boolean {
                        // Check if numberToChange is 0
                        if (numberToChange === 0) {
                            return true
                        }

                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
                `,
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params) as HotStreakChunk
        expect(result.text).toMatchInlineSnapshot(`
          "export function log(message: string) {
              // Log a message
              console.log(message)
          }

          export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if numberToChange is 0
              if (numberToChange === 0) {
                  return true
              }

              // Check if numberToChange is 1
              if (numberToChange === 1) {
                  return false
          "
        `)
        expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
          "export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if numberToChange is 0
              if (numberToChange === 0) {
                  return true
              }

              // Check if numberToChange is 1
              if (numberToChange === 1) {
                  return false
          "
        `)
    })

    // TODO: Need to allow lines after after when response if finished.
    // We ignore this because we don't support ending on a change
    it.skip('prediction with lines added after the range', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            latestFullPrediction: dedent`
                    export function isEvenOrOdd(numberToChange: number): boolean {
                        // Check if numberToChange is 0
                        if (numberToChange === 0) {
                            return true
                        }

                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }

                        // Check if numberToChange is 2
                        if (numberToChange === 2) {
                            return true
                        }

                        // Check if numberToChange is 3
                        if (numberToChange === 3) {
                            return false
                        }

                        // Check if numberToChange is 4
                        if (numberToChange === 4) {
                            return true
                        }

                        // Check if numberToChange is 5
                        if (numberToChange === 5) {
                            return false
                        }

                        throw new Error('Out of RAM')
                    }

                    export function log(message: string) {
                        // Log a message
                        console.log(message)
                    }\n
                `,
            processedPrediction: '',
        })
        const result = getHotStreakChunk(params) as HotStreakChunk
        expect(result.text).toMatchInlineSnapshot(`
          "export function log(message: string) {
              // Log a message
              console.log(message)
          }

          export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if numberToChange is 0
              if (numberToChange === 0) {
                  return true
              }

              // Check if numberToChange is 1
              if (numberToChange === 1) {
                  return false
          "
        `)
        expect(result.codeToReplaceData.codeToRewrite).toMatchInlineSnapshot(`
          "export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if numberToChange is 0
              if (numberToChange === 0) {
                  return true
              }

              // Check if numberToChange is 1
              if (numberToChange === 1) {
                  return false
          "
        `)
    })
})

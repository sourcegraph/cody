import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import dedent from 'dedent'
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
    prediction,
    responseType = 'partial',
}: {
    document: vscode.TextDocument
    position: vscode.Position
    prediction: string
    responseType?: 'success' | 'partial'
}): GetHotStreakChunkParams {
    const codeToReplaceData = createCodeToReplaceDataForTest(MOCK_EXISTING_CODE, {
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 30,
    })

    return {
        prediction: prediction,
        document,
        position,
        codeToReplaceData,
        response: createSuggestedResponse(prediction, responseType),
    }
}

describe('getHotStreakChunk', () => {
    it('no latest prediction and no processed prediction', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            prediction: '',
        })
        const result = getHotStreakChunk(params)
        expect(result).toBe(null)
    })

    it('prediction with no changes', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            prediction: dedent`
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

    it('prediction with no changes but with changes in the processed prediction', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            prediction: dedent`
                        // Check if numberToChange is 1
                        if (numberToChange === 1) {
                            return false
                        }\n
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
            prediction: dedent`
                    export function isEvenOrOdd(target: number): boolean {
                        // Check if target is 0
                        if (target === 0) {
                            return true
                        }\n
                `,
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
        expect(document.getText(result.range)).toMatchInlineSnapshot(`
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
            prediction: dedent`
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
        expect(document.getText(result.range)).toMatchInlineSnapshot(`
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
            prediction: dedent`
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
        expect(document.getText(result.range)).toMatchInlineSnapshot(`
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

    it('suggests a prediction ending on a change when the response is of type success', () => {
        const { document, position } = documentAndPosition(MOCK_EXISTING_CODE)
        const params = createTestParams({
            document,
            position,
            prediction: dedent`
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
                    }
                `,
            responseType: 'success',
        })
        const result = getHotStreakChunk(params) as HotStreakChunk
        expect(result.text).toMatchInlineSnapshot(`
          "export function isEvenOrOdd(numberToChange: number): boolean {
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
          }
          "
        `)
        expect(document.getText(result.range)).toMatchInlineSnapshot(`
          "export function isEvenOrOdd(numberToChange: number): boolean {
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
          "
        `)
    })
})

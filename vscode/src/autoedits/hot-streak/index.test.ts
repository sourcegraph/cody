import type { CodeToReplaceData } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { type ProcessHotStreakResponsesParams, processHotStreakResponses } from '.'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import { AutoeditStopReason, type ModelResponse } from '../adapters/base'
import type { SuggestedPredictionResult } from '../autoedits-provider'
import { createCodeToReplaceDataForTest } from '../prompt/test-helper'

// Helper to create a generator for model responses
async function* createModelResponseGenerator(
    predictions: string[],
    type: 'partial' | 'success' | 'aborted' = 'partial',
    stopReason = AutoeditStopReason.RequestFinished
): AsyncGenerator<ModelResponse> {
    let cumulativePrediction = ''

    // Yield all but the last prediction as partial responses
    for (let i = 0; i < predictions.length - 1; i++) {
        cumulativePrediction += predictions[i] + '\n'
        yield {
            type: 'partial',
            prediction: cumulativePrediction,
            stopReason: AutoeditStopReason.StreamingChunk,
            requestHeaders: {},
            requestUrl: 'test-url',
        }
    }

    if (predictions.length > 0) {
        cumulativePrediction += predictions[predictions.length - 1]
        yield {
            type: 'success',
            prediction: cumulativePrediction,
            stopReason: AutoeditStopReason.RequestFinished,
            responseBody: {},
            requestHeaders: {},
            responseHeaders: {},
            requestUrl: 'test-url',
        }
    }
}

const MOCK_CODE = `
export function isEvenOrOdd(numberToChange: number): boolean {█
    // Check if target is 0
    if (numberToChange === 0) {
        return true
    }
    // Check if target is 1
    if (numberToChange === 1) {
        return false
    }
    // Check if target is 2
    if (numberToChange === 2) {
        return true
    }
    // Check if target is 3
    if (numberToChange === 3) {
        return false
    }
    // Check if target is 4
    if (numberToChange === 4) {
        return true
    }
    // Check if target is 5
    if (numberToChange === 5) {
        return false
    }
    throw new Error('Out of RAM')
}
`

const MOCK_CODE_WITHOUT_CURSOR = MOCK_CODE.replaceAll('█', '')

const MOCK_PREDICTION = `
export function isEvenOrOdd(target: number): boolean {
    if (target === 0) {
        return true
    }
    if (target === 1) {
        return false
    }
    if (target === 2) {
        return true
    }
    if (target === 3) {
        return false
    }
    if (target === 4) {
        return true
    }
    if (target === 5) {
        return false
    }
    throw new Error('Out of RAM')
}
`

function getCodeToReplaceWindow(codeToReplaceData: CodeToReplaceData): string {
    return (
        codeToReplaceData.prefixBeforeArea +
        codeToReplaceData.prefixInArea +
        codeToReplaceData.codeToRewrite +
        codeToReplaceData.suffixInArea +
        codeToReplaceData.suffixAfterArea
    )
}

function createHotStreakParams(code: string): ProcessHotStreakResponsesParams {
    const { document, position } = documentAndPosition(code)
    const codeToReplaceData = createCodeToReplaceDataForTest(code, {
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 30,
    })
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
    })

    const responseGenerator = createModelResponseGenerator(MOCK_PREDICTION.split('\n'))

    return {
        responseGenerator,
        document,
        codeToReplaceData,
        docContext: docContext,
        position,
        options: {
            hotStreakEnabled: true,
        },
    }
}

describe('processHotStreakResponses', () => {
    it('does not emit hot streaks if disabled', async () => {
        const params = createHotStreakParams(MOCK_CODE)
        const resultGenerator = processHotStreakResponses({
            ...params,
            options: { hotStreakEnabled: false },
        })

        const results = []
        for await (const result of resultGenerator) {
            results.push(result)
        }
        expect(results.length).toBe(1)
        const finalResponse = results[0] as SuggestedPredictionResult
        expect(finalResponse.type).toBe('suggested')
        expect(finalResponse.response.prediction).toBe(MOCK_PREDICTION)
        expect(finalResponse.response.stopReason).toBe(AutoeditStopReason.RequestFinished) // No hot-streak
        expect(finalResponse.codeToReplaceData.codeToRewrite).toBe(MOCK_CODE_WITHOUT_CURSOR)
    })

    it('does emit hot streaks when enabled', async () => {
        const params = createHotStreakParams(MOCK_CODE)
        const resultGenerator = processHotStreakResponses(params)

        const results = []
        for await (const result of resultGenerator) {
            results.push(result)
        }

        // Chunked into multiple results
        expect(results.length).toBe(2)

        const firstResponse = results[0] as SuggestedPredictionResult
        expect(firstResponse.type).toBe('suggested')
        expect(firstResponse.response.prediction).toMatchInlineSnapshot(`
          "
          export function isEvenOrOdd(target: number): boolean {
              if (target === 0) {
                  return true
              }
              if (target === 1) {
                  return false
              }
              if (target === 2) {
                  return true
              }
              if (target === 3) {
                  return false
              }
          "
        `)
        expect(getCodeToReplaceWindow(firstResponse.codeToReplaceData)).toMatchInlineSnapshot(`
          "
          export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if target is 0
              if (numberToChange === 0) {
                  return true
              }
              // Check if target is 1
              if (numberToChange === 1) {
                  return false
              }
              // Check if target is 2
              if (numberToChange === 2) {
                  return true
              }
              // Check if target is 3
              if (numberToChange === 3) {
                  return false
              }
              // Check if target is 4
              if (numberToChange === 4) {
                  return true
              }
              // Check if target is 5
              if (numberToChange === 5) {
                  return false
              }
              throw new Error('Out of RAM')
          }
          "
        `)

        const lastResponse = results[1] as SuggestedPredictionResult
        expect(lastResponse.type).toBe('suggested')
        expect(lastResponse.response.prediction).toMatchInlineSnapshot(`
          "    if (target === 4) {
                  return true
              }
              if (target === 5) {
                  return false
              }
              throw new Error('Out of RAM')
          }
          "
        `)

        const window =
            lastResponse.codeToReplaceData.prefixBeforeArea +
            lastResponse.codeToReplaceData.prefixInArea +
            lastResponse.codeToReplaceData.codeToRewrite +
            lastResponse.codeToReplaceData.suffixInArea +
            lastResponse.codeToReplaceData.suffixAfterArea
        expect(window).toMatchInlineSnapshot(`
          "
          export function isEvenOrOdd(target: number): boolean {
              if (target === 0) {
                  return true
              }
              if (target === 1) {
                  return false
              }
              if (target === 2) {
                  return true
              }
              if (target === 3) {
                  return false
              }
              // Check if target is 3
              if (numberToChange === 3) {
                  return false
              }
              // Check if target is 4
              if (numberToChange === 4) {
                  return true
              }
              // Check if target is 5
              if (numberToChange === 5) {
                  return false
              }
              throw new Error('Out of RAM')
          }
          "
        `)
    })
})

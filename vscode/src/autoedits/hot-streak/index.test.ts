import dedent from 'dedent'
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
            responseHeaders: {},
            responseBody: {},
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

const MOCK_CODE_WITHOUT_CURSOR = MOCK_CODE.replace('█', '')

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

function createHotStreakParams(
    code: string,
    responseGenerator: AsyncGenerator<ModelResponse>
): ProcessHotStreakResponsesParams {
    const { document, position } = documentAndPosition(code)
    const codeToReplaceData = createCodeToReplaceDataForTest(code, {
        maxPrefixLength: 2000,
        maxSuffixLength: 2000,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 30,
    })
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 2000,
        maxSuffixLength: 2000,
    })

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
        const responseGenerator = createModelResponseGenerator(MOCK_PREDICTION.split('\n'))
        const params = createHotStreakParams(MOCK_CODE, responseGenerator)
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
        const responseGenerator = createModelResponseGenerator(MOCK_PREDICTION.split('\n'))
        const params = createHotStreakParams(MOCK_CODE, responseGenerator)
        const resultGenerator = processHotStreakResponses(params)

        const results = []
        for await (const result of resultGenerator) {
            results.push(result)
        }

        const suggestedResults = results.filter(result => result.type === 'suggested')
        expect(suggestedResults.length).toBe(6)

        let resultSnapshot = ''
        for (const result of suggestedResults) {
            expect(result.type).toBe('suggested')
            expect(result.response.stopReason).toBe(AutoeditStopReason.HotStreak)
            resultSnapshot += `
Code to Rewrite:
${result.codeToReplaceData.codeToRewrite}
Prediction:
${result.response.prediction}
            `
        }
        expect(resultSnapshot).toMatchSnapshot()
    })

    it('does not emit hot streak if its suffix is already in the code', async () => {
        const documentText = dedent`import argparse

            def run_batch_job(sanitized_mu, sanitized_dn, sanitized_ts, sanitized_n, sanitized_h, sanitized_pid):
                # Placeholder function for running the batch job
                print(f"Running batch job with:\nModel URL: {sanitized_mu}\nDataset Name: {sanitized_dn}\n"
                    f"Training Script: {sanitized_ts}\nIterations: {sanitized_n}\n"
                    f"Hyperparameters: {sanitized_h}\nProject ID: {sanitized_pid}")

            def main():
                parser = argparse.ArgumentParser(description='Run batch job process.')
                parser.add_argument('--use_cached_model', action='store_true', he█)
                parser.add_argument('--num_iterations', type=int)
                parser.add_argument('--model_url')
                parser.add_argument('--dataset_name')
                parser.add_argument('--training_script')
                parser.add_argument('--hyperparameters')
                parser.add_argument('--project_id')

                args = parser.parse_args()

                sanitized_mu = args.model_url or input("Enter the model URL: ")
                sanitized_dn = args.dataset_name or input("Enter the dataset name: ")
                sanitized_ts = args.training_script or input("Enter the path to the training script: ")
                sanitized_h = args.hyperparameters or input("Enter the hyperparameters for batch job (in JSON format): ")
                sanitized_n = args.num_iterations or input("Enter the number of iterations: ")
                sanitized_pid = args.project_id or input("Enter the project ID: ")

                run_batch_job(sanitized_mu, sanitized_dn, sanitized_ts, sanitized_n, sanitized_h, sanitized_pid)

            if __name__ == '__main__':
                main()\n`

        // The second hot streak prediction ends with the last line of the document code.
        // But the codeToReplaceData.range.end is at the start of the last line, which means
        // the decoration info will consider the last line to be modified with the last line
        // context insertion.
        //
        // This creates a hot-streak item that we later will move the cursor to. And this item
        // will be hidden by the autoedit-provider because the end of the prediction matches
        // text that is already in the document.
        //
        // To fix that we can check for the suffix match before emiting the hot-streak item.
        const predictionText = dedent`
                parser = argparse.ArgumentParser(description='Run batch job process.')
                parser.add_argument('--use_cached_model', action='store_true', help='Use cached model')
                parser.add_argument('--num_iterations', type=int, help='Number of iterations')
                parser.add_argument('--model_url', help='Model URL')
                parser.add_argument('--dataset_name', help='Dataset name')
                parser.add_argument('--training_script', help='Path to training script')
                parser.add_argument('--hyperparameters', help='Hyperparameters for batch job (in JSON format)')
                parser.add_argument('--project_id', help='Project ID')

                args = parser.parse_args()

            █    sanitized_mu = args.model_url or input("Enter the model URL: ")
                sanitized_dn = args.dataset_name or input("Enter the dataset name: ")
                sanitized_ts = args.training_script or input("Enter the path to the training script: ")
                sanitized_h = args.hyperparameters or input("Enter the hyperparameters for batch job (in JSON format): ")
                sanitized_n = args.num_iterations or input("Enter the number of iterations: ")
                sanitized_pid = args.project_id or input("Enter the project ID: ")

                run_batch_job(sanitized_mu, sanitized_dn, sanitized_ts, sanitized_n, sanitized_h, sanitized_pid)

            if __name__ == '__main__':
                main()`

        const responseGenerator = async function* (
            predictions: string[]
        ): AsyncGenerator<ModelResponse> {
            let cumulativePrediction = ''

            // Yield all but the last prediction as partial responses
            for (let i = 0; i < predictions.length - 1; i++) {
                cumulativePrediction += predictions[i]
                yield {
                    type: 'partial',
                    prediction: cumulativePrediction,
                    stopReason: AutoeditStopReason.StreamingChunk,
                    requestHeaders: {},
                    requestUrl: 'test-url',
                    responseHeaders: {},
                    responseBody: {},
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
        const params = createHotStreakParams(documentText, responseGenerator(predictionText.split('█')))
        const resultGenerator = processHotStreakResponses(params)

        const results = []
        for await (const result of resultGenerator) {
            results.push(result)
        }

        // Only the first change is returned, the rest is unchanged
        expect(results.length).toBe(2)

        const firstResponse = results[0] as SuggestedPredictionResult
        expect(firstResponse.type).toBe('suggested')
        expect(firstResponse.response.prediction).toMatchInlineSnapshot(`
          "parser = argparse.ArgumentParser(description='Run batch job process.')
              parser.add_argument('--use_cached_model', action='store_true', help='Use cached model')
              parser.add_argument('--num_iterations', type=int, help='Number of iterations')
              parser.add_argument('--model_url', help='Model URL')
              parser.add_argument('--dataset_name', help='Dataset name')
              parser.add_argument('--training_script', help='Path to training script')
              parser.add_argument('--hyperparameters', help='Hyperparameters for batch job (in JSON format)')
              parser.add_argument('--project_id', help='Project ID')

              args = parser.parse_args()

          "
        `)

        // The second response is ignored as there is no change in the diff
        const secondResponse = results[1] as SuggestedPredictionResult
        expect(secondResponse.type).toBe('ignored')
    })
})

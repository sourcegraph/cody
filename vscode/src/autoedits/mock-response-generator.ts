import { AutoeditStopReason, type ModelResponse } from './adapters/base'
import { autoeditSource } from './analytics-logger'
import { autoeditsProviderConfig } from './autoedits-config'

/**
 * Creates a mock response generator that simulates streaming by chunking the prediction
 * and emitting it in controlled chunks until the full response is sent.
 */
export async function* createMockResponseGenerator(prediction: string): AsyncGenerator<ModelResponse> {
    // Split the prediction into lines
    const lines = prediction.split('\n')
    let emittedLines = 0

    // Common response properties
    const commonProps = {
        requestUrl: autoeditsProviderConfig.url,
        source: autoeditSource.cache,
    }

    while (emittedLines < lines.length) {
        const remainingLines = lines.length - emittedLines
        const chunkSize = Math.min(remainingLines, 2)

        const newEmittedLines = emittedLines + chunkSize
        const isLastChunk = newEmittedLines >= lines.length

        if (isLastChunk) {
            yield {
                type: 'success',
                stopReason: AutoeditStopReason.RequestFinished,
                prediction,
                responseHeaders: {},
                responseBody: {},
                ...commonProps,
            }
            return
        }

        const partialPrediction = lines.slice(0, newEmittedLines).join('\n') + '\n'
        yield {
            type: 'partial',
            stopReason: AutoeditStopReason.StreamingChunk,
            prediction: partialPrediction,
            responseHeaders: {},
            responseBody: {},
            ...commonProps,
        }
        emittedLines = newEmittedLines
    }
}

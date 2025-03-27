import { isAbortError } from '@sourcegraph/cody-shared'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import { AutoeditStopReason, type ModelResponse } from './base'

export interface RawStreamEvent {
    event: 'data' | 'done' | 'error'
    data: string
}

export interface StreamProcessingInfo {
    requestUrl: string
    requestHeaders: Record<string, string>
    responseHeaders?: Record<string, string>
    extractPrediction: (body: any) => string
    abortSignal: AbortSignal
}

export async function* processRawStreamEvents(
    streamSource: AsyncIterable<RawStreamEvent>,
    {
        requestUrl,
        requestHeaders,
        responseHeaders: initialResponseHeaders,
        abortSignal,
        extractPrediction,
    }: StreamProcessingInfo
): AsyncGenerator<ModelResponse> {
    let prediction = ''
    let lastPartialResponse: ModelResponse | null = null
    let responseHeaders = initialResponseHeaders || {}

    try {
        for await (const { event, data } of streamSource) {
            if (abortSignal.aborted) {
                yield {
                    type: 'aborted',
                    stopReason: AutoeditStopReason.RequestAborted,
                    requestHeaders: requestHeaders,
                    requestUrl: requestUrl,
                }
                return
            }

            if (event === 'error') {
                throw new Error(`Stream error: ${data}`)
            }

            if (event === 'done') {
                break
            }

            if (event === 'data') {
                try {
                    const parsed = JSON.parse(data)

                    // Attempt to extract response headers from the first valid chunk if not already present
                    // NOTE: This depends heavily on how the WS proxy sends headers. Need to debug
                    if (!Object.keys(responseHeaders).length && parsed?.responseHeaders) {
                        responseHeaders = parsed.responseHeaders
                    }

                    const predictionChunk = extractPrediction(parsed)
                    if (predictionChunk) {
                        prediction += predictionChunk
                        lastPartialResponse = {
                            type: 'partial',
                            stopReason: AutoeditStopReason.StreamingChunk,
                            prediction,
                            responseHeaders,
                            responseBody: parsed,
                            requestHeaders: requestHeaders,
                            requestUrl: requestUrl,
                        }
                        yield lastPartialResponse
                    }
                } catch (parseError) {
                    throw new Error(`Failed to parse stream data: ${parseError}`)
                }
            }
        }

        // After the loop (stream finished successfully)
        if (abortSignal.aborted) {
            yield {
                type: 'aborted',
                stopReason: AutoeditStopReason.RequestAborted,
                requestHeaders: requestHeaders,
                requestUrl: requestUrl,
            }
            return
        }

        if (!lastPartialResponse && !prediction) {
            // Handle cases where the stream finished but no prediction was ever generated
            throw new Error('Stream finished but no prediction was received.')
        }

        // Yield final success response
        yield {
            type: 'success',
            stopReason: AutoeditStopReason.RequestFinished,
            prediction,
            responseHeaders: responseHeaders,
            requestHeaders: requestHeaders,
            requestUrl: requestUrl,
            // responseBody could be the last chunk's body or maybe undefined/null for the final success marker
            responseBody: (lastPartialResponse as any)?.responseBody ?? null,
        }
    } catch (error) {
        if (isAbortError(error) || abortSignal.aborted) {
            yield {
                type: 'aborted',
                stopReason: AutoeditStopReason.RequestAborted,
                requestHeaders: requestHeaders,
                requestUrl: requestUrl,
            }
            return
        }
        autoeditsOutputChannelLogger.logError('processRawStreamEvents', 'Error processing stream:', {
            verbose: error,
        })
        throw error
    }
}

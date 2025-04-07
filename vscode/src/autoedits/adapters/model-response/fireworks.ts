import { createSSEIterator, fetch, isAbortError, isNodeResponse } from '@sourcegraph/cody-shared'
import { AutoeditStopReason, type ModelResponse, type SuccessModelResponse } from '../base'
import type { AutoeditsRequestBody } from '../utils'

export interface FireworksResponse {
    choices: [{ message?: { content: string }; text?: string }]
}

export async function* getFireworksModelResponse({
    apiKey,
    url,
    body,
    abortSignal,
    extractPrediction,
    customHeaders = {},
}: {
    apiKey: string
    url: string
    body: AutoeditsRequestBody
    abortSignal: AbortSignal
    extractPrediction: (body: FireworksResponse) => string
    customHeaders?: Record<string, string>
}): AsyncGenerator<ModelResponse> {
    const isStreamingRequest = 'stream' in body && body.stream
    const requestHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(isStreamingRequest ? { 'Accept-Encoding': 'gzip;q=0' } : {}),
        ...customHeaders,
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body),
            signal: abortSignal,
        })

        if (response.status !== 200) {
            const errorText = await response.text()
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
        }

        // Extract headers into a plain object
        const responseHeaders: Record<string, string> = {}
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value
        })

        // For backward compatibility, we have to check if the response is an SSE stream or a
        // regular JSON payload. This ensures that the request also works against older backends
        const isStreamingResponse = response.headers.get('content-type')?.startsWith('text/event-stream')

        if (isStreamingResponse && isNodeResponse(response)) {
            const sseIterator = createSSEIterator(response.body)
            const state: Pick<SuccessModelResponse, 'responseBody' | 'prediction'> = {
                responseBody: {},
                prediction: '',
            }

            for await (const { data } of sseIterator) {
                if (abortSignal.aborted) {
                    yield {
                        type: 'aborted',
                        stopReason: AutoeditStopReason.RequestAborted,
                        requestHeaders: requestHeaders,
                        requestUrl: url,
                    }
                    return
                }

                if (data === '[DONE]') {
                    yield {
                        type: 'success',
                        stopReason: AutoeditStopReason.RequestFinished,
                        prediction: state.prediction,
                        requestHeaders: requestHeaders,
                        requestUrl: url,
                        responseHeaders,
                        responseBody: state.responseBody,
                    }
                    break
                }

                try {
                    state.responseBody = JSON.parse(data)
                    const predictionChunk = extractPrediction(state.responseBody as FireworksResponse)
                    if (predictionChunk) {
                        state.prediction += predictionChunk
                        yield {
                            type: 'partial',
                            stopReason: AutoeditStopReason.StreamingChunk,
                            prediction: state.prediction,
                            requestHeaders: requestHeaders,
                            requestUrl: url,
                        }
                    }
                } catch (parseError) {
                    throw new Error(`Failed to parse stream data: ${parseError}`)
                }
            }

            return
        }

        // Handle non-streaming response
        const responseBody = (await response.json()) as FireworksResponse
        const prediction = extractPrediction(responseBody)
        if (typeof prediction !== 'string') {
            throw new Error(`response does not satisfy SuccessModelResponse: ${responseBody}`)
        }

        yield {
            type: 'success',
            stopReason: AutoeditStopReason.RequestFinished,
            prediction,
            responseBody,
            responseHeaders,
            requestHeaders,
            requestUrl: url,
        }
    } catch (error) {
        if (isAbortError(error)) {
            yield {
                type: 'aborted',
                stopReason: AutoeditStopReason.RequestAborted,
                requestHeaders,
                requestUrl: url,
            }
            return
        }

        // Propagate error the auto-edit provider
        throw error
    }
}

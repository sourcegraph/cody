import { createSSEIterator, fetch, isAbortError, isNodeResponse } from '@sourcegraph/cody-shared'
import { AutoeditStopReason, type ModelResponse, type ModelResponseShared } from '../base'
import {
    type RawStreamEvent,
    type StreamProcessingInfo,
    processRawStreamEvents,
} from '../process-raw-stream-events'

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
    body: ModelResponseShared['requestBody']
    abortSignal: AbortSignal
    extractPrediction: (body: any) => string
    customHeaders?: Record<string, string>
}): AsyncGenerator<ModelResponse> {
    const requestHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(body?.stream ? { 'Accept-Encoding': 'gzip;q=0' } : {}),
        ...customHeaders,
    }

    const streamInfoBase: Omit<
        StreamProcessingInfo,
        'abortSignal' | 'extractPrediction' | 'responseHeaders'
    > = {
        requestUrl: url,
        requestHeaders,
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
            const streamSource = (async function* (): AsyncIterable<RawStreamEvent> {
                for await (const { event, data } of sseIterator) {
                    if (event === 'error') {
                        yield { event: 'error', data }
                    } else if (data === '[DONE]') {
                        yield { event: 'done', data }
                    } else {
                        yield { event: 'data', data }
                    }
                }
            })()

            const streamInfo: StreamProcessingInfo = {
                ...streamInfoBase,
                responseHeaders,
                abortSignal,
                extractPrediction,
            }

            yield* processRawStreamEvents(streamSource, streamInfo)
            return
        }

        // Handle non-streaming response
        const responseBody = await response.json()
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

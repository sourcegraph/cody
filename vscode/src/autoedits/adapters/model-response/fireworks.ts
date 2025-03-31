import { createSSEIterator, fetch, isAbortError, isNodeResponse } from '@sourcegraph/cody-shared'
import { AutoeditStopReason, type ModelResponse, type ModelResponseShared } from '../base'

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
            let prediction = ''
            const sseIterator = createSSEIterator(response.body)
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
                        prediction,
                        requestHeaders: requestHeaders,
                        requestUrl: url,
                        responseHeaders,
                        responseBody: await response.json(),
                    }
                    break
                }

                try {
                    const predictionChunk = extractPrediction(data)
                    if (predictionChunk) {
                        prediction += predictionChunk
                        yield {
                            type: 'partial',
                            stopReason: AutoeditStopReason.StreamingChunk,
                            prediction,
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

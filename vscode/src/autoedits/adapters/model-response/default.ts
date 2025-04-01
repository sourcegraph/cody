import { isAbortError } from '@sourcegraph/cody-shared'
import { AutoeditStopReason, type ModelResponse } from '../base'
import type { AutoeditsRequestBody } from '../utils'

export async function* getDefaultModelResponse({
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
    extractPrediction: (body: any) => string
    customHeaders?: Record<string, string>
}): AsyncGenerator<ModelResponse> {
    const requestHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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

        const responseBody = await response.json()
        const prediction = extractPrediction(responseBody)
        if (typeof prediction !== 'string') {
            throw new Error(`response does not satisfy SuccessModelResponse: ${responseBody}`)
        }

        yield {
            type: 'success',
            prediction,
            responseBody,
            responseHeaders,
            stopReason: AutoeditStopReason.RequestFinished,
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
        }

        // Propagate error the auto-edit provider
        throw error
    }
}

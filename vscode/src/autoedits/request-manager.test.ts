import dedent from 'dedent'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { documentAndPosition } from '../completions/test-helpers'

import { AutoeditStopReason, type ModelResponse } from './adapters/base'
import { autoeditSource } from './analytics-logger'
import { type AutoeditRequestManagerParams, RequestManager } from './request-manager'

function createSuccessResponse(prediction: string): ModelResponse {
    return {
        type: 'success',
        stopReason: AutoeditStopReason.RequestFinished,
        prediction,
        requestUrl: 'https://test.com',
        responseHeaders: {},
        responseBody: {},
        source: autoeditSource.network,
    }
}

function createRequestParams(code: TemplateStringsArray): AutoeditRequestManagerParams {
    const { document, position } = documentAndPosition(dedent(code))

    return {
        uri: document.uri.toString(),
        documentVersion: document.version,
        position,
        requestUrl: 'https://test.com',
        abortSignal: new AbortController().signal,
    }
}

describe('Autoedits RequestManager', () => {
    let requestManager: RequestManager

    beforeAll(() => {
        vi.useFakeTimers()
    })

    afterAll(() => {
        vi.useRealTimers()
    })

    beforeEach(() => {
        requestManager = new RequestManager()
    })

    it('caches responses and retrieves them for exact matches', async () => {
        const params = createRequestParams`function hello() {█`
        const prediction = '\n  console.log("Hello, world!");\n}'

        const mockRequest = vi.fn().mockImplementation(async () => {
            await vi.advanceTimersByTimeAsync(100)
            return createSuccessResponse(prediction)
        })

        const responsePromise = requestManager.request(params, mockRequest)
        await vi.advanceTimersByTimeAsync(200) // Give time for the request to complete
        const responseFromNetwork = (await responsePromise) as ModelResponse

        expect(responseFromNetwork.type).toBe('success')
        expect('source' in responseFromNetwork ? responseFromNetwork.source : null).toBe(
            autoeditSource.network
        )
        expect('prediction' in responseFromNetwork ? responseFromNetwork.prediction : null).toBe(
            prediction
        )

        const responseFromCache = (await requestManager.request(params, mockRequest)) as ModelResponse

        expect(responseFromCache.type).toBe('success')
        expect('source' in responseFromCache ? responseFromCache.source : null).toBe(
            autoeditSource.cache
        )
        expect('prediction' in responseFromCache ? responseFromCache.prediction : null).toBe(prediction)
        expect(mockRequest).toHaveBeenCalledTimes(1)
    })
})

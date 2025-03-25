import dedent from 'dedent'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { documentAndPosition } from '../completions/test-helpers'

import type { SuccessModelResponse } from './adapters/base'
import { autoeditSource } from './analytics-logger'
import { type AutoeditRequestManagerParams, RequestManager } from './request-manager'

function createSuccessResponse(prediction: string): SuccessModelResponse {
    return {
        type: 'success',
        source: autoeditSource.network,
        prediction,
        requestUrl: 'https://test.com',
        responseHeaders: {},
        responseBody: {},
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
        const responseFromNetwork = (await responsePromise) as SuccessModelResponse

        expect(responseFromNetwork.type).toBe('success')
        expect(responseFromNetwork.source).toBe(autoeditSource.network)
        expect(responseFromNetwork.prediction).toBe(prediction)

        const responseFromCache = (await requestManager.request(
            params,
            mockRequest
        )) as SuccessModelResponse

        expect(responseFromCache.type).toBe('success')
        expect(responseFromCache.source).toBe(autoeditSource.cache)
        expect(responseFromCache.prediction).toBe(prediction)
        expect(mockRequest).toHaveBeenCalledTimes(1)
    })
})

import dedent from 'dedent'
import {
    type MockInstance,
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import * as vscode from 'vscode'

import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'
import { documentAndPosition } from '../completions/test-helpers'

import { AutoeditStopReason } from './adapters/base'
import { type AutoeditSourceMetadata, autoeditSource, autoeditTriggerKind } from './analytics-logger'
import type {
    AbortedPredictionResult,
    PredictionResult,
    SuggestedPredictionResult,
} from './autoedits-provider'
import { createCodeToReplaceDataForTest, isTemplateStringsArray } from './prompt/test-helper'
import { type AutoeditRequestManagerParams, RequestManager } from './request-manager'
import * as requestRecycling from './request-recycling'

describe('Autoedits RequestManager', () => {
    let requestManager: RequestManager
    let isNotRecyclable: MockInstance<typeof requestRecycling.isNotRecyclable>

    beforeAll(() => {
        vi.useFakeTimers()
    })

    afterAll(() => {
        vi.useRealTimers()
    })

    beforeEach(() => {
        requestManager = new RequestManager()
        isNotRecyclable = vi.spyOn(requestRecycling, 'isNotRecyclable')
    })

    afterEach(() => {
        isNotRecyclable.mockClear()
    })

    it('caches responses and retrieves them for exact matches', async () => {
        const params = createRequestParams`function hello() {█`
        const prediction = '\n  log("Hello, world!");\n}'

        const mockRequest = vi.fn().mockImplementation(async function* () {
            await vi.advanceTimersByTimeAsync(100)
            yield createSuccessResponse(
                prediction,
                params.documentUri,
                params.requestDocContext,
                params.codeToReplaceData
            )
        })

        const responsePromise = requestManager.request(params, mockRequest)
        await vi.advanceTimersByTimeAsync(200) // Give time for the request to complete
        const responseFromNetwork = (await responsePromise) as SuggestedPredictionResult

        expect(responseFromNetwork.type).toBe('suggested')
        expect(responseFromNetwork.response.source).toBe(autoeditSource.network)
        expect(responseFromNetwork.response.prediction).toBe(prediction)

        const responseFromCache = (await requestManager.request(
            params,
            mockRequest
        )) as SuggestedPredictionResult

        expect(responseFromCache.type).toBe('suggested')
        expect(responseFromCache.response.source).toBe(autoeditSource.cache)
        expect(responseFromCache.response.prediction).toBe(prediction)
        expect(mockRequest).toHaveBeenCalledTimes(1)
    })

    it('recycles responses for type-forward patterns (same line expansion)', async () => {
        const [request1, request2] = await startRequests({
            requests: [
                { code: 'const x = █', prediction: 'const x = 42;' },
                { code: 'const x = 4█', prediction: 'const x = 4000;', delayBeforeRequestStart: 250 },
            ],
        })

        expect(isNotRecyclable).toHaveBeenCalledTimes(1)
        expect(isNotRecyclable).nthReturnedWith(1, false)

        verifyResponse({ request: request1 })
        verifyResponse({
            request: request2,
            source: autoeditSource.inFlightRequest,
            prediction: request1.prediction,
        })
    })

    it('recycles responses for type-forward patterns (multiple line expansion)', async () => {
        const [request1, request2] = await startRequests({
            requests: [
                {
                    code: 'function test() {█',
                    prediction: `function test() {
                      log("test");
                      return true;
                    }`,
                },
                {
                    code: `function test() {
                      log("█`,
                    prediction: `function test() {
                      log("something else");
                      return true;
                    }`,
                    delayBeforeRequestStart: 250,
                },
            ],
        })

        expect(isNotRecyclable).toHaveBeenCalledTimes(1)
        expect(isNotRecyclable).nthReturnedWith(1, false)

        verifyResponse({ request: request1 })
        verifyResponse({
            request: request2,
            source: autoeditSource.inFlightRequest,
            prediction: request1.prediction,
        })
    })

    it('handles multiple concurrent type-forward recycling', async () => {
        const [request1, request2, request3] = await startRequests({
            requests: [
                {
                    code: 'function process(data) {█',
                    prediction: `function process(data) {
                      return data.map(item => item.value * 2);
                    }`,
                },
                {
                    code: `function process(data) {
                      return data.map█`,
                    prediction: `function process(data) {
                      return data.map(item => throw new Error("response 2"));
                    }`,
                    delayBeforeRequestStart: 250,
                },
                {
                    code: `function process(data) {
                      return data.map(item => it█`,
                    prediction: `function process(data) {
                      return data.map(item => throw new Error("response 3"));
                    }`,
                    delayBeforeRequestStart: 250,
                },
            ],
        })

        expect(isNotRecyclable).toHaveBeenCalledTimes(2)
        expect(isNotRecyclable).nthReturnedWith(1, false)
        expect(isNotRecyclable).nthReturnedWith(2, false)

        verifyResponse({ request: request1 })
        verifyResponse({
            request: request2,
            source: autoeditSource.inFlightRequest,
            prediction: request1.prediction,
        })
        verifyResponse({
            request: request3,
            source: autoeditSource.inFlightRequest,
            prediction: request1.prediction,
        })
    })

    describe('does not recycle when', () => {
        it('the type-forward pattern does not match', async () => {
            const [request1, request2] = await startRequests({
                requests: [
                    { code: 'const arr = [█', prediction: 'const arr = [1, 2, 3];' },
                    {
                        code: 'const arr = [5, 6█',
                        prediction: 'const arr = [5, 6, 7];',
                        delayBeforeRequestStart: 500,
                    },
                ],
            })

            expect(isNotRecyclable).toHaveBeenCalledTimes(1)
            expect(isNotRecyclable).toHaveReturnedWith(
                requestRecycling.notRecyclableReason.predictedTextDoesNotMatch
            )

            verifyResponse({ request: request1 })
            verifyResponse({ request: request2 })
        })

        it('line is modfied with deletions', async () => {
            const [request1, request2] = await startRequests({
                requests: [
                    {
                        code: 'function helloBob() {█',
                        prediction: `function helloBob() {
                        return "Hello, Bob!";
                        }`,
                    },
                    {
                        code: 'function hello() {█',
                        prediction: `function hello() {
                        return "Hello, world!";
                        }`,
                        delayBeforeRequestStart: 500,
                    },
                ],
            })

            expect(isNotRecyclable).toHaveBeenCalledTimes(1)
            expect(isNotRecyclable).toHaveReturnedWith(
                requestRecycling.notRecyclableReason.notOnlyAdditions
            )

            verifyResponse({ request: request1 })
            verifyResponse({ request: request2 })
        })

        it('multiple lines are modified', async () => {
            const [request1, request2] = await startRequests({
                requests: [
                    {
                        code: `function sum(a, b) {
                            const result = a + b;█`,
                        prediction: `function sum(a, b) {
                            const result = a + b; return result;
                        }`,
                    },
                    {
                        code: `function my_sum(a, b) {
                            const result = a + b; print█`,
                        prediction: `function my_sum(a, b) {
                            const result = a + b; print("result");
                        }`,
                        delayBeforeRequestStart: 250,
                    },
                ],
            })

            expect(isNotRecyclable).toHaveBeenCalledTimes(1)
            expect(isNotRecyclable).toHaveReturnedWith(
                requestRecycling.notRecyclableReason.moreThanOneLineAddedOrModified
            )

            verifyResponse({ request: request1 })
            verifyResponse({ request: request2 })
        })

        it('lines are deleted', async () => {
            const [request1, request2] = await startRequests({
                requests: [
                    {
                        code: `function printNumbers() {
                            // comment
                            print(1█`,
                        prediction: `function printNumbers() {
                            print(10)
                            print(20)
                            print(30)
                        }`,
                    },
                    {
                        code: `function printNumbers() {
                            print(1)█`,
                        prediction: `function printNumbers() {
                            print(1)
                            print(2)
                            print(3)
                        }`,
                    },
                ],
            })

            expect(isNotRecyclable).toHaveBeenCalledTimes(1)
            expect(isNotRecyclable).toHaveReturnedWith(
                requestRecycling.notRecyclableReason.notOnlyAdditions
            )

            verifyResponse({ request: request1 })
            verifyResponse({ request: request2 })
        })
    })
})

interface RequestWithResponse {
    code: string
    prediction: string
    response: SuggestedPredictionResult
    mockRequest: MockInstance<typeof RequestManager.prototype.request>
}

function verifyResponse({
    request,
    source = autoeditSource.network,
    calledTimes = 1,
    prediction = request.prediction,
}: {
    request: RequestWithResponse
    prediction?: string
    source?: AutoeditSourceMetadata
    calledTimes?: number
}) {
    expect(request.response.type).toBe('suggested')
    expect(request.response.response.prediction).toBe(prediction)
    expect(request.response.response.source).toBe(source)
    expect(request.mockRequest).toHaveBeenCalledTimes(calledTimes)
}

async function startRequests({
    requests,
    requestManager = new RequestManager(),
}: {
    requests: {
        code: string
        prediction: string
        serverProcessingTime?: number
        delayBeforeRequestStart?: number
    }[]
    requestManager?: RequestManager
}): Promise<RequestWithResponse[]> {
    const requestsWithResponses: Partial<RequestWithResponse>[] = requests
    const pendingResponses: Promise<PredictionResult>[] = []

    for (let i = 0; i < requests.length; i++) {
        const { code, prediction, serverProcessingTime = 500, delayBeforeRequestStart = 0 } = requests[i]
        const requestParams = createRequestParams(code, { documentVersion: i })

        const mockRequest = vi.fn().mockImplementationOnce(async function* (abortSignal: AbortSignal) {
            if (abortSignal.aborted) {
                yield createAbortResponse()
                return
            }
            logDebug('server started processing request', i)
            await vi.advanceTimersByTimeAsync(serverProcessingTime)
            logDebug('server finished processing request', i)
            if (abortSignal.aborted) {
                yield createAbortResponse()
                return
            }
            yield createSuccessResponse(
                prediction,
                requestParams.documentUri,
                requestParams.requestDocContext,
                requestParams.codeToReplaceData
            )
        })

        vi.advanceTimersByTime(delayBeforeRequestStart)
        logDebug('request ready to be sent', i)
        const responsePromise = requestManager.request(requestParams, mockRequest)
        pendingResponses.push(responsePromise)
        requestsWithResponses[i].mockRequest = mockRequest
    }

    const responses = await Promise.all(pendingResponses)

    return requestsWithResponses.map((request, index) => ({
        ...request,
        response: responses[index] as SuggestedPredictionResult,
    })) as RequestWithResponse[]
}

function createSuccessResponse(
    prediction: string,
    uri: string,
    docContext: DocumentContext,
    codeToReplaceData: CodeToReplaceData
): Omit<SuggestedPredictionResult, 'cacheId'> {
    return {
        type: 'suggested',
        response: {
            type: 'success',
            stopReason: AutoeditStopReason.RequestFinished,
            source: autoeditSource.network,
            prediction,
            requestUrl: 'https://test.com',
            responseHeaders: {},
            responseBody: {},
        },
        uri,
        editPosition: new vscode.Position(0, 0),
        docContext,
        codeToReplaceData,
    }
}

function createAbortResponse(): AbortedPredictionResult {
    return {
        type: 'aborted',
        response: {
            type: 'aborted',
            requestUrl: 'https://test.com',
            stopReason: AutoeditStopReason.RequestAborted,
        },
    }
}

function createRequestParams(
    code: TemplateStringsArray | string,
    { documentVersion }: { documentVersion: number } = { documentVersion: 1 }
): AutoeditRequestManagerParams {
    const documentText = isTemplateStringsArray(code) ? dedent(code) : code.toString()
    const { document, position } = documentAndPosition(documentText)

    const codeToReplaceData = createCodeToReplaceDataForTest(code, {
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        maxPrefixLinesInArea: 2,
        maxSuffixLinesInArea: 2,
        codeToRewritePrefixLines: 1,
        codeToRewriteSuffixLines: 1,
        prefixTokens: 100,
        suffixTokens: 100,
    })

    return {
        requestId: 'test-request-id' as any,
        documentUri: document.uri.toString(),
        documentText: document.getText(),
        documentVersion,
        position,
        requestUrl: 'https://test.com',
        abortSignal: new AbortController().signal,
        codeToReplaceData,
        requestDocContext: {} as DocumentContext,
        triggerKind: autoeditTriggerKind.automatic,
    }
}

const areDebugLogsEnabled = false
function logDebug(...args: unknown[]) {
    if (areDebugLogsEnabled) {
        console.log(`[${performance.now()}]`, ...args)
    }
}

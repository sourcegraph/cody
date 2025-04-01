import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import type { PredictionResult } from './autoedits-provider'

import { forkSignal } from '../completions/utils'
import {
    AutoeditStopReason,
    type PartialModelResponse,
    type SuccessModelResponse,
} from './adapters/base'
import { autoeditSource } from './analytics-logger'
import type { CodeToReplaceData } from './prompt/prompt-utils'

export interface AutoeditRequestManagerParams {
    requestUrl: string
    uri: string
    documentVersion: number
    position: vscode.Position
    abortSignal: AbortSignal
}

// Define an interface for cache entries to include adjustedCodeToReplaceData
interface CacheEntry {
    response: SuccessModelResponse | PartialModelResponse
    adjustedCodeToReplaceData?: CodeToReplaceData
}

export class RequestManager implements vscode.Disposable {
    private cache = new LRUCache<string, CacheEntry>({
        max: 50,
    })
    private readonly inflightRequests = new LRUCache<string, InflightRequest>({ max: 20 })

    /**
     * Execute a request or use a cached/in-flight result if available
     */
    public async request(
        params: AutoeditRequestManagerParams,
        makeRequest: (abortSignal: AbortSignal) => Promise<AsyncGenerator<PredictionResult>>
    ): Promise<PredictionResult> {
        // 1. First check the cache for exact matches
        const cachedResponse = this.checkCache(params)
        if (cachedResponse) {
            return { response: cachedResponse }
        }

        // 2. Then check for a matching in-flight request
        const inflightRequest = this.findMatchingInflightRequest(params)
        if (inflightRequest) {
            const { response, adjustedCodeToReplaceData } = await inflightRequest.promise
            if (response.type === 'success') {
                return {
                    response: {
                        ...response,
                        source: autoeditSource.inFlightRequest,
                    },
                    adjustedCodeToReplaceData,
                }
            }
            return { response, adjustedCodeToReplaceData }
        }

        if (params.abortSignal.aborted) {
            return {
                response: {
                    type: 'aborted',
                    stopReason: AutoeditStopReason.RequestAborted,
                    requestUrl: params.requestUrl,
                },
            }
        }

        // 3. Create a new request if we couldn't reuse anything and the request is not aborted
        const request = new InflightRequest(params)
        this.inflightRequests.set(request.cacheKey, request)

        // Cancel any irrelevant requests based on the current request
        this.cancelIrrelevantRequests()

        // Start processing the request in the background
        this.processRequestInBackground(request, makeRequest)

        return request.promise
    }

    private async processRequestInBackground(
        request: InflightRequest,
        makeRequest: (abortSignal: AbortSignal) => Promise<AsyncGenerator<ModelResponse>>
    ): Promise<void> {
        try {
            let hasResolved = false
            for await (const { response, adjustedCodeToReplaceData } of await makeRequest(
                request.abortController.signal
            )) {
                if (response.type === 'partial') {
                    if (response.stopReason === AutoeditStopReason.HotStreak) {
                        // Cache hot-streak responses for future use
                        const hotStreakLineCount = response.prediction.split('\n').length
                        const hotStreakCacheKey = request.cacheKey + '-hotstreak-' + hotStreakLineCount
                        this.cache.set(hotStreakCacheKey, {
                            response,
                            adjustedCodeToReplaceData,
                        })

                        // If this is the first hot streak, resolve it immediately while continuing to stream
                        if (!hasResolved) {
                            hasResolved = true
                            // Resolve with the hot streak response but don't break the loop
                            request.resolve({ response, adjustedCodeToReplaceData })
                        }
                    }

                    // Continue processing the stream regardless of whether we resolved
                    continue
                }

                if (response.type === 'success') {
                    this.cache.set(request.cacheKey, {
                        response: {
                            ...response,
                            source: autoeditSource.cache,
                        },
                        adjustedCodeToReplaceData,
                    })

                    console.log('SUCCESS', { response })
                    if (!hasResolved) {
                        // If we haven't resolved yet, do it now with the final response
                        hasResolved = true
                        request.resolve({ response, adjustedCodeToReplaceData })
                    }
                    // Always recycle the response even if we already resolved
                    this.recycleResponseForInflightRequests(request, response)
                } else if (!hasResolved) {
                    // Only resolve with error responses if we haven't already resolved
                    hasResolved = true
                    request.resolve({ response, adjustedCodeToReplaceData })
                }
            }
        } catch (error) {
            request.reject(error as Error)
        } finally {
            this.inflightRequests.delete(request.cacheKey)
        }
    }

    public removeFromCache(params: RequestCacheKeyParams): void {
        this.cache.delete(createCacheKey(params))
    }

    private findMatchingInflightRequest(
        params: AutoeditRequestManagerParams
    ): InflightRequest | undefined {
        const key = createCacheKey(params)

        for (const request of this.inflightRequests.values() as Generator<InflightRequest>) {
            if (request.isResolved) continue // Skip already resolved requests with same key

            if (request.cacheKey === key || request.coversSameArea(params)) {
                return request
            }
        }

        return undefined
    }

    public checkCache(
        params: AutoeditRequestManagerParams
    ): SuccessModelResponse | PartialModelResponse | null {
        const cached = this.cache.get(createCacheKey(params))

        return cached?.response ?? null
    }

    /**
     * Try to recycle a completed request's response for other in-flight requests
     */
    private recycleResponseForInflightRequests(
        completedRequest: InflightRequest,
        response: SuccessModelResponse
    ): void {
        // TODO: Implement
    }

    /**
     * Cancel any in-flight requests that are no longer relevant compared to the latest request
     */
    private cancelIrrelevantRequests(): void {
        // TODO: Implement
    }

    public dispose(): void {
        this.cache.clear()
        for (const request of this.inflightRequests.values() as Generator<InflightRequest>) {
            request.abortNetworkRequest()
        }
        this.inflightRequests.clear()
    }
}

class InflightRequest {
    public promise: Promise<PredictionResult>
    public resolve: (result: PredictionResult) => void
    public reject: (error: Error) => void
    public startedAt = performance.now()
    public isResolved = false
    public abortController: AbortController
    public cacheKey: string

    constructor(public params: AutoeditRequestManagerParams) {
        this.cacheKey = createCacheKey(params)
        // TODO: decouple the autoedit provider abort signal from the one used by the request manager
        // so that we can keep some older requests alive for recycling.
        this.abortController = forkSignal(params.abortSignal)

        this.resolve = () => {}
        this.reject = () => {}

        this.promise = new Promise<PredictionResult>((resolve, reject) => {
            this.resolve = result => {
                console.log('UMPOX RESOLVING REQUEST', result)
                this.isResolved = true
                resolve(result)
            }
            this.reject = reject
        })
    }

    public abortNetworkRequest(): void {
        this.abortController.abort()
    }

    /**
     * Check if the request is 1-2 lines above of the new request and the document version is the same.
     * This means we can reuse its response for the new request.
     */
    public coversSameArea(params: AutoeditRequestManagerParams): boolean {
        return (
            params.uri === this.params.uri &&
            params.documentVersion === this.params.documentVersion &&
            params.position.line - this.params.position.line >= 0 &&
            params.position.line - this.params.position.line <= 1
        )
    }
}

interface RequestCacheKeyParams {
    uri: string
    documentVersion: number
    position: vscode.Position
}

function createCacheKey({ uri, documentVersion, position }: RequestCacheKeyParams): string {
    return `${uri}:${documentVersion}:${position.line}`
}

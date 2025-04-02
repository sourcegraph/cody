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

export interface AutoeditRequestManagerParams {
    requestUrl: string
    uri: string
    documentVersion: number
    position: vscode.Position
    abortSignal: AbortSignal
}

/**
 * Cached predictions that can be reused
 */
interface CacheEntry extends PredictionResult {
    response: SuccessModelResponse | PartialModelResponse
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
            return cachedResponse
        }

        // 2. Then check for a matching in-flight request
        const inflightRequest = this.findMatchingInflightRequest(params)
        if (inflightRequest) {
            const { response, ...rest } = await inflightRequest.promise
            if (response.type === 'success') {
                return {
                    response: {
                        ...response,
                        source: autoeditSource.inFlightRequest,
                    },
                    ...rest,
                }
            }
            return { response, ...rest }
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
            for await (const result of await makeRequest(request.abortController.signal)) {
                if (result.response.type === 'aborted') {
                    request.resolve(result)
                    continue
                }

                if (
                    result.response.type === 'partial' &&
                    result.response.stopReason !== AutoeditStopReason.HotStreak
                ) {
                    // Partial response that we haven't made into a hot-streak
                    // Continue streaming
                    continue
                }

                let cacheKey = request.cacheKey
                const isHotStreak = result.response.stopReason === AutoeditStopReason.HotStreak
                if (isHotStreak && result.nextCursorPosition) {
                    // Hot streak means one request can provide many cache items.
                    // Use the next cursor position to create a unique cache key.
                    cacheKey = createCacheKey({
                        ...params,
                        position: result.nextCursorPosition,
                    })
                }
                this.cache.set(cacheKey, result as CacheEntry)

                // A promise will never resolve more than once, so we don't need
                // to check if the request was already fulfilled.
                request.resolve(result)

                // Always recycle the response even if we already resolved
                this.recycleResponseForInflightRequests(request, result)
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

    public checkCache(params: AutoeditRequestManagerParams): CacheEntry | null {
        const cached = this.cache.get(createCacheKey(params))
        return cached ?? null
    }

    /**
     * Try to recycle a completed request's response for other in-flight requests
     */
    private recycleResponseForInflightRequests(
        completedRequest: InflightRequest,
        result: PredictionResult
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

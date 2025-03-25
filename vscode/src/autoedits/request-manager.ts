import { LRUCache } from 'lru-cache'
import type * as vscode from 'vscode'

import { forkSignal } from '../completions/utils'
import type { ModelResponse, SuccessModelResponse } from './adapters/base'
import { autoeditSource } from './analytics-logger'

export interface AutoeditRequestManagerParams {
    requestUrl: string
    uri: string
    documentVersion: number
    position: vscode.Position
    abortSignal: AbortSignal
}

export class RequestManager implements vscode.Disposable {
    private cache = new LRUCache<string, { response: SuccessModelResponse }>({ max: 50 })
    private readonly inflightRequests = new LRUCache<string, InflightRequest>({ max: 20 })

    /**
     * Execute a request or use a cached/in-flight result if available
     */
    public async request(
        params: AutoeditRequestManagerParams,
        makeRequest: (abortSignal: AbortSignal) => Promise<ModelResponse>
    ): Promise<ModelResponse> {
        // 1. First check the cache for exact matches
        const cachedResponse = this.checkCache(params)
        if (cachedResponse) {
            return cachedResponse
        }

        // 2. Then check for a matching in-flight request
        const inflightRequest = this.findMatchingInflightRequest(params)
        if (inflightRequest) {
            const response = await inflightRequest.promise
            if (response.type === 'success') {
                return {
                    ...response,
                    source: autoeditSource.inFlightRequest,
                }
            }
            return response
        }

        if (params.abortSignal.aborted) {
            return { type: 'aborted', requestUrl: params.requestUrl }
        }

        // 3. Create a new request if we couldn't reuse anything and the request is not aborted
        const request = new InflightRequest(params)
        this.inflightRequests.set(request.cacheKey, request)

        // Cancel any irrelevant requests based on the current request
        this.cancelIrrelevantRequests()

        // 4. Make the actual request
        makeRequest(request.abortController.signal)
            .then(response => {
                if (response.type === 'success') {
                    this.cache.set(request.cacheKey, {
                        response: {
                            ...response,
                            source: autoeditSource.cache,
                        },
                    })

                    request.resolve(response)
                    this.recycleResponseForInflightRequests(request, response)
                } else {
                    request.resolve(response)
                }
            })
            .catch(error => {
                request.reject(error)
            })
            .finally(() => {
                this.inflightRequests.delete(request.cacheKey)
            })

        // Return the promise to the client immediately and handle request completion in promise callbacks.
        return request.promise
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

    public checkCache(params: AutoeditRequestManagerParams): SuccessModelResponse | null {
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
    public promise: Promise<ModelResponse>
    public resolve: (result: ModelResponse) => void
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

        this.promise = new Promise<ModelResponse>((resolve, reject) => {
            this.resolve = result => {
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

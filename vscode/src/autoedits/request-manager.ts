import { LRUCache } from 'lru-cache'
import * as uuid from 'uuid'
import type * as vscode from 'vscode'

import type { CodeToReplaceData, DocumentContext } from '@sourcegraph/cody-shared'

import { forkSignal } from '../completions/utils'

import { AutoeditStopReason } from './adapters/base'
import type {
    AutoeditCacheID,
    AutoeditHotStreakID,
    AutoeditRequestID,
    AutoeditTriggerKindMetadata,
} from './analytics-logger'
import { autoeditAnalyticsLogger, autoeditSource, autoeditTriggerKind } from './analytics-logger'
import type { PredictionResult, SuggestedPredictionResult } from './autoedits-provider'
import type { ProcessedHotStreakResponse } from './hot-streak'
import {
    isNotRecyclableCacheItem,
    isNotRecyclableRequest,
    isRequestNotRelevant,
} from './request-recycling'

export interface AutoeditRequestManagerParams {
    requestId: AutoeditRequestID
    requestUrl: string
    documentUri: string
    documentText: string
    documentVersion: number
    codeToReplaceData: CodeToReplaceData
    requestDocContext: DocumentContext
    position: vscode.Position
    abortSignal: AbortSignal
    triggerKind: AutoeditTriggerKindMetadata
}

export class RequestManager implements vscode.Disposable {
    private cache = new LRUCache<AutoeditCacheID, SuggestedPredictionResult & { timestamp: number }>({
        max: 50,
    })
    private readonly inflightRequests = new LRUCache<string, InflightRequest>({ max: 20 })

    /** Track the latest request to help determine if other requests are still relevant */
    private latestRequestParams: AutoeditRequestManagerParams | null = null

    /**
     * Keeps track of the last accepted hot-streak suggestion.
     * Used to reliably retrieve the next hot-streak suggestion when retrieving
     * from the cache.
     */
    public lastAcceptedHotStreakId: AutoeditHotStreakID | undefined

    /**
     * Execute a request or use a cached/in-flight result if available
     */
    public async request(
        params: AutoeditRequestManagerParams,
        makeRequest: (abortSignal: AbortSignal) => Promise<AsyncGenerator<ProcessedHotStreakResponse>>
    ): Promise<PredictionResult> {
        console.log('--------------------------------------------')
        console.log(`new request ${params.position.line}:${params.position.character}`)
        // 1. First check the cache for exact matches if trigger kind is not manual
        if (params.triggerKind !== autoeditTriggerKind.manual) {
            const cachedResponse = this.checkCache(params)
            if (cachedResponse) {
                console.log('cache')
                return cachedResponse
            }

            console.log('no cached response')
        } else {
            console.log('manual trigger')
        }

        // 2. Then check for a matching in-flight request
        const inflightRequest = this.findMatchingInflightRequest(params)
        if (inflightRequest) {
            const result = await inflightRequest.promise
            console.log('inflight', result)
            if (result.type === 'suggested' && result.response.type === 'success') {
                return {
                    ...result,
                    response: {
                        ...result.response,
                        source: autoeditSource.inFlightRequest,
                    },
                }
            }
            return result
        }

        if (params.abortSignal.aborted) {
            return {
                type: 'aborted',
                response: {
                    type: 'aborted',
                    stopReason: AutoeditStopReason.RequestAborted,
                    requestUrl: params.requestUrl,
                },
            }
        }

        // 3. Create a new request if we couldn't reuse anything and the request is not aborted
        const request = new InflightRequest(params)
        this.inflightRequests.set(request.key, request)

        // Cancel any irrelevant requests based on the current request
        this.cancelIrrelevantRequests()

        // Start processing the request in the background
        this.processRequestInBackground(request, makeRequest, params)
        console.log('network')

        // Return the promise to the client immediately and handle request completion in promise callbacks.
        return request.promise
    }

    private async processRequestInBackground(
        request: InflightRequest,
        makeRequest: (abortSignal: AbortSignal) => Promise<AsyncGenerator<ProcessedHotStreakResponse>>,
        params: AutoeditRequestManagerParams
    ): Promise<void> {
        try {
            for await (const result of await makeRequest(request.abortController.signal)) {
                if (result.type === 'aborted') {
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

                const cacheId = uuid.v4() as AutoeditCacheID
                const resolvedResult =
                    result.type === 'suggested'
                        ? {
                              ...result,
                              cacheId: cacheId,
                          }
                        : result

                if (resolvedResult.type === 'suggested') {
                    this.cache.set(cacheId, {
                        ...resolvedResult,
                        timestamp: Date.now(),
                        response: { ...resolvedResult.response, source: autoeditSource.cache },
                    })

                    if (resolvedResult.hotStreakId) {
                        // For autoedit debug panel
                        autoeditAnalyticsLogger.recordHotStreakLoaded({
                            requestId: request.params.requestId,
                            hotStreakId: resolvedResult.hotStreakId,
                            chunk: {
                                prediction: resolvedResult.response.prediction,
                                modelResponse: resolvedResult.response,
                                fullPrediction: resolvedResult.fullPrediction,
                            },
                        })
                    }
                }

                // A promise will never resolve more than once, so we don't need
                // to check if the request was already fulfilled.
                request.resolve(resolvedResult)

                // Always recycle the response even if we already resolved
                this.recycleResponseForInflightRequests(request, resolvedResult)

                // After processing a completed request, check if any other requests are now irrelevant
                this.cancelIrrelevantRequests()
            }
        } catch (error) {
            request.reject(error as Error)
        } finally {
            this.inflightRequests.delete(request.key)
        }
    }

    public removeFromCache(id: AutoeditCacheID): void {
        this.cache.delete(id)
    }

    private findMatchingInflightRequest(
        params: AutoeditRequestManagerParams
    ): InflightRequest | undefined {
        const key = createRequestKey({
            documentUri: params.documentUri,
            documentVersion: params.documentVersion,
            position: params.position,
        })

        for (const request of this.inflightRequests.values() as Generator<InflightRequest>) {
            if (request.isResolved) continue // Skip already resolved requests with same key

            // TODO: uncomment this once we have a way to leverage requests with slightly different positions
            if (request.key === key /** || request.coversSameArea(params) */) {
                return request
            }
        }

        return undefined
    }

    /**
     * Check the cache fuzzily for a match.
     * Looks for items that are still valid in the document and are within a certain distance from the cursor
     */
    public checkCache(params: AutoeditRequestManagerParams): SuggestedPredictionResult | null {
        if (this.lastAcceptedHotStreakId) {
            const hotStreakId = this.lastAcceptedHotStreakId

            // Always reset the hot-streak ID. If we don't find a match, a new request
            // will be triggered anyway.
            this.lastAcceptedHotStreakId = undefined

            return this.getNearestHotStreakItem({
                hotStreakId,
                position: params.position,
            })
        }

        const matches = this.getValidCacheItemsForDocument(params) as (SuggestedPredictionResult & {
            timestamp: number
        })[]
        if (matches.length === 0) {
            // No matches found
            return null
        }

        // Find match with closest range.start
        let closestMatch: (SuggestedPredictionResult & { timestamp: number }) | null = null
        let closestDistance = Number.MAX_SAFE_INTEGER
        const maxDistance = 5 // Avoid matching too far from the cursor

        for (const match of matches) {
            const distance = Math.abs(match.codeToReplaceData.range.start.line - params.position.line)

            if (
                distance < closestDistance &&
                distance <= maxDistance &&
                (!closestMatch || match.timestamp > closestMatch?.timestamp)
            ) {
                closestDistance = distance
                closestMatch = match
            }
        }
        console.log({
            closestMatch,
            distances: matches.map(m =>
                Math.abs(m.codeToReplaceData.range.start.line - params.position.line)
            ),
        })

        return closestMatch
    }

    public getValidCacheItemsForDocument(
        params: AutoeditRequestManagerParams
    ): SuggestedPredictionResult[] {
        const matchingItems: SuggestedPredictionResult[] = []
        const { documentText, documentUri } = params

        for (const key of [...this.cache.keys()]) {
            const item = this.cache.get(key)
            if (!item || item.uri !== documentUri) {
                continue
            }

            // Check that the rewrite area is still present in the document
            // This is a good indicator that the item is still valid
            // const rewriteArea =
            //     item.codeToReplaceData.prefixInArea +
            //     item.codeToReplaceData.codeToRewrite +
            //     item.codeToReplaceData.suffixInArea

            // if (documentText.includes(rewriteArea)) {
            //     console.log('match because of the rewrite area')
            //     matchingItems.push(item)
            // }

            params.position === item.editPosition

            const notRecyclableReason = isNotRecyclableCacheItem(
                { codeToReplaceData: item.codeToReplaceData, documentUri: item.uri },
                { codeToReplaceData: params.codeToReplaceData, documentUri: params.documentUri },
                item.response
            )

            if (!notRecyclableReason) {
                console.log('match because of not notRecyclableReason')
                matchingItems.push(item)
            }
        }

        return matchingItems
    }

    public getNearestHotStreakItem({
        hotStreakId,
        position,
    }: {
        hotStreakId: AutoeditHotStreakID
        position: vscode.Position
    }): SuggestedPredictionResult | null {
        let closestItem: SuggestedPredictionResult | null = null
        let minDistance = Number.MAX_SAFE_INTEGER

        for (const key of [...this.cache.keys()]) {
            const item = this.cache.get(key)
            if (!item || item.hotStreakId !== hotStreakId) {
                // Skip items that don't match the hot streak ID
                continue
            }

            const distance = item.editPosition.line - position.line
            if (distance < minDistance) {
                minDistance = distance
                closestItem = item
            }
        }

        return closestItem
    }

    private recycleResponseForInflightRequests(
        completedRequest: InflightRequest,
        result: PredictionResult
    ): void {
        for (const inflightRequest of this.inflightRequests.values() as Generator<InflightRequest>) {
            // Skip the request that just completed
            if (inflightRequest === completedRequest) {
                continue
            }

            if (!inflightRequest.isResolved) {
                const reasonNotToRecycle = isNotRecyclableRequest(
                    completedRequest,
                    inflightRequest,
                    result.response
                )

                // console.log(
                //     'reasonNotToRecycle',
                //     Object.entries(notRecyclableReason).find(
                //         ([key, value]) => value === reasonNotToRecycle
                //     )?.[0]
                // )

                if (!reasonNotToRecycle && result.type === 'suggested') {
                    inflightRequest.abortNetworkRequest()
                    inflightRequest.resolve({
                        ...result,
                        response: {
                            ...result.response,
                            source: autoeditSource.inFlightRequest,
                        },
                    })
                    this.inflightRequests.delete(inflightRequest.key)
                }
            }
        }
    }

    /**
     * Cancel any in-flight requests that are no longer relevant compared to the latest request
     */
    private cancelIrrelevantRequests(): void {
        if (!this.latestRequestParams) {
            return
        }

        const inflightRequests = Array.from(this.inflightRequests.values() as Generator<InflightRequest>)

        for (const request of inflightRequests) {
            if (request.isResolved) {
                continue
            }

            const notRelevantReason = isRequestNotRelevant(request.params, this.latestRequestParams)
            if (notRelevantReason) {
                request.abortNetworkRequest()
                request.resolve({
                    type: 'aborted',
                    response: {
                        type: 'aborted',
                        requestUrl: request.params.requestUrl,
                        stopReason: AutoeditStopReason.IrrelevantInFlightRequest,
                    },
                })
                this.inflightRequests.delete(request.key)
            }
        }
    }

    public dispose(): void {
        this.cache.clear()
        for (const request of this.inflightRequests.values() as Generator<InflightRequest>) {
            request.abortNetworkRequest()
        }
        this.inflightRequests.clear()
    }
}

export class InflightRequest {
    public promise: Promise<PredictionResult>
    public resolve: (result: PredictionResult) => void
    public reject: (error: Error) => void
    public startedAt = performance.now()
    public isResolved = false
    public abortController: AbortController
    public key: string

    constructor(public params: AutoeditRequestManagerParams) {
        this.key = createRequestKey({
            documentUri: params.documentUri,
            documentVersion: params.documentVersion,
            position: params.position,
        })
        // TODO: decouple the autoedit provider abort signal from the one used by the request manager
        // so that we can keep some older requests alive for recycling.
        this.abortController = forkSignal(params.abortSignal)

        this.resolve = () => {}
        this.reject = () => {}

        this.promise = new Promise<PredictionResult>((resolve, reject) => {
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
            params.documentUri === this.params.documentUri &&
            params.documentVersion === this.params.documentVersion &&
            params.position.line - this.params.position.line >= 0 &&
            params.position.line - this.params.position.line <= 1
        )
    }
}

interface RequestKeyParams
    extends Pick<AutoeditRequestManagerParams, 'documentUri' | 'documentVersion' | 'position'> {}

function createRequestKey({ documentUri, documentVersion, position }: RequestKeyParams): string {
    return `${documentUri}:${documentVersion}:${position.line}`
}

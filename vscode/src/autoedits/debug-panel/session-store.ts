import { LRUCache } from 'lru-cache'
import type { AutoeditRequestState } from '../analytics-logger/types'

export interface RequestCacheEntry {
    // prompt cache hit rate for the request.
    // This is only available if the fireworks response headers are available.
    promptCacheHitRate?: number
    // e2e latency for the request.
    e2eLatency: number
    // Fireworks inference latency for the request.
    inferenceLatency?: number
}

export interface SessionStats {
    requestMetrics: RequestCacheEntry[]
}

/**
 * Tracks the stats for auto-edit requests across the session.
 */
export class SessionStatsTracker {
    private readonly requestMetrics = new LRUCache<string, RequestCacheEntry>({ max: 500 })

    public trackRequest(state: AutoeditRequestState): void {
        // Required metrics are available after the loaded phase to start tracking.
        if (state.phase !== 'loaded') {
            return
        }

        const headers = state.payload.responseHeaders

        const cacheEntry: RequestCacheEntry = {
            promptCacheHitRate: this.getPromptCacheHitRate(headers),
            e2eLatency: state.payload.latency,
            inferenceLatency: this.getInferenceLatency(headers),
        }
        // Add new entry to the Map
        this.requestMetrics.set(state.requestId, cacheEntry)
    }

    private getInferenceLatency(
        responseHeaders: Record<string, string> | undefined
    ): number | undefined {
        if (!responseHeaders) {
            return undefined
        }
        const inferenceTime =
            Number.parseFloat(responseHeaders['fireworks-server-processing-time']) * 1000
        return inferenceTime
    }

    private getPromptCacheHitRate(
        responseHeaders: Record<string, string> | undefined
    ): number | undefined {
        if (!responseHeaders) {
            return undefined
        }
        const cachedTokens = responseHeaders?.['fireworks-cached-prompt-tokens']
        const totalTokens = responseHeaders?.['fireworks-prompt-tokens']
        if (cachedTokens && totalTokens) {
            return (Number(cachedTokens) / Number(totalTokens)) * 100
        }
        return undefined
    }

    public getCurrentStats(): SessionStats {
        return {
            requestMetrics: Array.from(this.requestMetrics.values()).filter(
                (entry): entry is RequestCacheEntry => entry !== undefined
            ),
        }
    }
}

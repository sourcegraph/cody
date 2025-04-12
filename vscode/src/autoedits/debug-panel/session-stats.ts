import { LRUCache } from 'lru-cache'

import type { Phase } from '../analytics-logger/types'

import { extractPromptCacheHitRate, getDetailedTimingInfo } from './autoedit-latency-utils'
import type { AutoeditRequestDebugState } from './debug-store'

export interface LatencyStats {
    p90: number
    p75: number
    p50: number
}

export interface AutoeditSessionStats {
    numberOfRequests: number
    contextLoadedLatency: LatencyStats
    endToEndLatency: LatencyStats
    inferenceLatency: LatencyStats
    envoyLatency: LatencyStats
    networkLatency: LatencyStats
    meanCacheHitRate: {
        all: number
        suggested: number
        readOrAccepted: number
    }
}

export const defaultSessionStats: AutoeditSessionStats = {
    numberOfRequests: 0,
    contextLoadedLatency: {
        p90: 0,
        p75: 0,
        p50: 0,
    },
    endToEndLatency: {
        p90: 0,
        p75: 0,
        p50: 0,
    },
    inferenceLatency: {
        p90: 0,
        p75: 0,
        p50: 0,
    },
    envoyLatency: {
        p90: 0,
        p75: 0,
        p50: 0,
    },
    networkLatency: {
        p90: 0,
        p75: 0,
        p50: 0,
    },
    meanCacheHitRate: {
        all: 0,
        suggested: 0,
        readOrAccepted: 0,
    },
}

export interface StatisticsEntry {
    phase: Phase
    requestId: string
    endToEndLatencyMs?: number
    contextLoadedLatencyMs?: number
    inferenceTimeMs?: number
    envoyLatencyMs?: number
    networkLatencyMs?: number
    promptCacheHitRate?: number
}

export class SessionStatsTracker {
    private readonly requests = new LRUCache<string, StatisticsEntry>({ max: 5000 })
    private sessionStats: AutoeditSessionStats = { ...defaultSessionStats }
    private numberOfRequestsToShow = 500

    public getSessionStats(): {
        sessionStats: AutoeditSessionStats
        statsForLastNRequests: StatisticsEntry[]
    } {
        return {
            sessionStats: { ...this.sessionStats },
            statsForLastNRequests: Array.from(this.requests.values() as Generator<StatisticsEntry>)
                .filter(entry => entry.networkLatencyMs !== undefined)
                .slice(0, this.numberOfRequestsToShow),
        }
    }

    public trackRequest(request: AutoeditRequestDebugState): void {
        const { state } = request
        const timingInfo = getDetailedTimingInfo(request)
        const contextLoadedDetail = timingInfo.details.find(d => d.label === 'Context Loaded')
        const networkLatency = timingInfo.details.find(d => d.label === 'Network')
        const existingEntry = this.requests.get(state.requestId)

        const currentData = {
            requestId: state.requestId,
            phase: state.phase,
            endToEndLatencyMs: timingInfo.predictionDurationMs,
            inferenceTimeMs: timingInfo.inferenceTimeMs,
            envoyLatencyMs: timingInfo.envoyUpstreamServiceTimeMs,
            networkLatencyMs: networkLatency?.valueMs,
            contextLoadedLatencyMs: contextLoadedDetail?.valueMs,
            promptCacheHitRate: extractPromptCacheHitRate(request),
        }

        const entry = existingEntry
            ? {
                  ...currentData,
                  endToEndLatencyMs: currentData.endToEndLatencyMs ?? existingEntry.endToEndLatencyMs,
                  inferenceTimeMs: currentData.inferenceTimeMs ?? existingEntry.inferenceTimeMs,
                  envoyLatencyMs: currentData.envoyLatencyMs ?? existingEntry.envoyLatencyMs,
                  contextLoadedLatencyMs:
                      currentData.contextLoadedLatencyMs ?? existingEntry.contextLoadedLatencyMs,
                  promptCacheHitRate: currentData.promptCacheHitRate ?? existingEntry.promptCacheHitRate,
              }
            : currentData

        this.requests.set(state.requestId, entry)

        const requests = Array.from(this.requests.values()) as StatisticsEntry[]
        if (requests.length === 0) return

        this.updateLatencyStats(requests)
        this.updateCacheHitRateStats(requests)
        this.sessionStats.numberOfRequests = requests.length
    }

    private latencyMetrics = [
        {
            name: 'endToEndLatency',
            extractor: (entry: StatisticsEntry) => entry.endToEndLatencyMs,
        },
        {
            name: 'contextLoadedLatency',
            extractor: (entry: StatisticsEntry) => entry.contextLoadedLatencyMs,
        },
        {
            name: 'inferenceLatency',
            extractor: (entry: StatisticsEntry) => entry.inferenceTimeMs,
        },
        {
            name: 'envoyLatency',
            extractor: (entry: StatisticsEntry) => entry.envoyLatencyMs,
        },
        {
            name: 'networkLatency',
            extractor: (entry: StatisticsEntry) => entry.networkLatencyMs,
        },
    ] as const

    private updateLatencyStats(entries: StatisticsEntry[]): void {
        for (const metric of this.latencyMetrics) {
            const values = this.extractValidNumbers(entries, metric.extractor)

            if (values.length > 0) {
                this.sessionStats[metric.name] = {
                    p50: this.calculatePercentile(values, 50),
                    p75: this.calculatePercentile(values, 75),
                    p90: this.calculatePercentile(values, 90),
                }
            }
        }
    }

    private cacheHitRateCategories = [
        {
            name: 'all',
            filter: () => true,
        },
        {
            name: 'suggested',
            filter: (entry: StatisticsEntry) =>
                ['suggested', 'read', 'accepted', 'rejected'].includes(entry.phase),
        },
        {
            name: 'readOrAccepted',
            filter: (entry: StatisticsEntry) => ['read', 'accepted'].includes(entry.phase),
        },
    ] as const

    private updateCacheHitRateStats(entries: StatisticsEntry[]): void {
        for (const category of this.cacheHitRateCategories) {
            const filteredEntries = entries.filter(category.filter)
            const rates = this.extractValidNumbers(filteredEntries, entry => entry.promptCacheHitRate)

            if (rates.length > 0) {
                this.sessionStats.meanCacheHitRate[category.name] =
                    rates.reduce((sum, rate) => sum + rate, 0) / rates.length
            }
        }
    }

    private extractValidNumbers<T>(entries: T[], extractor: (entry: T) => number | undefined): number[] {
        return entries.map(extractor).filter((value): value is number => value !== undefined)
    }

    private calculatePercentile(values: number[], percentile: number): number {
        if (!values || values.length === 0) {
            return 0
        }

        const sorted = [...values].sort((a, b) => a - b)
        const index = Math.ceil((percentile / 100) * sorted.length) - 1
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
    }
}

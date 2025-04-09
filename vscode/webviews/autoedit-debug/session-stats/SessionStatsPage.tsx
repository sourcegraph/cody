import type { FC } from 'react'

import type {
    AutoeditSessionStats,
    StatisticsEntry,
} from '../../../src/autoedits/debug-panel/session-stats'
import { LatencyTrendGraph } from './LatencyTrendGraph'
import { RequestMetricsSummary } from './RequestMetricsTable'

// Format millisecond numbers as readable values
const formatMs = (ms?: number): string => {
    if (ms === undefined || ms === 0) return 'N/A'
    return `${ms.toFixed(0)}ms`
}

// Format percentage values
const formatPercent = (value?: number): string => {
    if (value === undefined) return 'N/A'
    return `${value.toFixed(2)}%`
}

// Constants for performance indicators
const END_TO_END_LATENCY_THRESHOLDS = {
    GOOD: 350,
    MODERATE: 450,
}

const CONTEXT_LOADED_LATENCY_THRESHOLDS = {
    GOOD: 20,
    MODERATE: 40,
}

const INFERENCE_LATENCY_THRESHOLDS = {
    GOOD: 150,
    MODERATE: 250,
}

const ENVOY_LATENCY_THRESHOLDS = {
    GOOD: 35,
    MODERATE: 50,
}

const NETWORK_LATENCY_THRESHOLDS = {
    GOOD: 250,
    MODERATE: 350,
}

const CACHE_HIT_RATE_THRESHOLDS = {
    POOR: 60,
    GOOD: 80,
}

const getLatencyBar = (value: number, maxValue: number, latencyType: string): JSX.Element => {
    // Safety check to avoid division by zero
    if (maxValue <= 0) return <div className="tw-h-1" />

    const percentage = Math.min(100, (value / maxValue) * 100)

    let thresholds = END_TO_END_LATENCY_THRESHOLDS

    // Select appropriate thresholds based on latency type
    switch (latencyType) {
        case 'endToEnd':
            thresholds = END_TO_END_LATENCY_THRESHOLDS
            break
        case 'contextLoaded':
            thresholds = CONTEXT_LOADED_LATENCY_THRESHOLDS
            break
        case 'inference':
            thresholds = INFERENCE_LATENCY_THRESHOLDS
            break
        case 'envoy':
            thresholds = ENVOY_LATENCY_THRESHOLDS
            break
        case 'network':
            thresholds = NETWORK_LATENCY_THRESHOLDS
            break
    }

    let colorClass = 'tw-bg-green-500' // Good (low latency)
    if (value > thresholds.MODERATE) {
        colorClass = 'tw-bg-red-500' // Poor (high latency)
    } else if (value > thresholds.GOOD) {
        colorClass = 'tw-bg-yellow-500' // Moderate
    }

    return (
        <div className="tw-w-full tw-bg-gray-200 tw-dark:tw-bg-gray-700 tw-h-1 tw-mt-1 tw-rounded-full">
            <div
                className={`tw-h-1 tw-rounded-full ${colorClass}`}
                style={{ width: `${percentage}%` }}
            />
        </div>
    )
}

const getCacheHitRateBar = (rate: number): JSX.Element => {
    let colorClass = 'tw-bg-red-500' // Poor
    if (rate >= CACHE_HIT_RATE_THRESHOLDS.GOOD) {
        colorClass = 'tw-bg-green-500' // Good
    } else if (rate >= CACHE_HIT_RATE_THRESHOLDS.POOR) {
        colorClass = 'tw-bg-yellow-500' // Moderate
    }

    return (
        <div className="tw-w-full tw-bg-gray-200 tw-dark:tw-bg-gray-700 tw-h-1 tw-mt-1 tw-rounded-full tw-overflow-hidden">
            <div className={`tw-h-1 tw-rounded-full ${colorClass}`} style={{ width: `${rate}%` }} />
        </div>
    )
}

const getCacheHitRateIndicator = (rate: number): JSX.Element => {
    let colorClass = 'tw-text-red-500' // Poor
    if (rate >= CACHE_HIT_RATE_THRESHOLDS.GOOD) {
        colorClass = 'tw-text-green-500' // Good
    } else if (rate >= CACHE_HIT_RATE_THRESHOLDS.POOR) {
        colorClass = 'tw-text-yellow-500' // Moderate
    }

    return <span className={`${colorClass} tw-mr-1`}>●</span>
}

// Extracted reusable LatencyCard component
interface LatencyCardProps {
    title: string
    latencyData: {
        p50?: number
        p75?: number
        p90?: number
    }
    latencyType: string
    maxLatencyP90: number
}

const LatencyCard: FC<LatencyCardProps> = ({ title, latencyData, latencyType, maxLatencyP90 }) => {
    const { p50, p75, p90 } = latencyData

    return (
        <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-4 tw-rounded tw-border tw-border-gray-200 tw-dark:tw-border-gray-700">
            <h4 className="tw-text-sm tw-font-medium tw-mb-3">{title}</h4>
            <div className="tw-space-y-3">
                {p50 !== undefined && p50 > 0 && (
                    <div>
                        <div className="tw-flex tw-justify-between tw-items-center">
                            <div className="tw-text-xs tw-text-gray-500">P50</div>
                            <div className="tw-text-xs tw-font-medium">{formatMs(p50)}</div>
                        </div>
                        {maxLatencyP90 > 0 && getLatencyBar(p50, maxLatencyP90, latencyType)}
                    </div>
                )}

                {p75 !== undefined && p75 > 0 && (
                    <div>
                        <div className="tw-flex tw-justify-between tw-items-center">
                            <div className="tw-text-xs tw-text-gray-500">P75</div>
                            <div className="tw-text-xs tw-font-medium">{formatMs(p75)}</div>
                        </div>
                        {maxLatencyP90 > 0 && getLatencyBar(p75, maxLatencyP90, latencyType)}
                    </div>
                )}

                {p90 !== undefined && p90 > 0 && (
                    <div>
                        <div className="tw-flex tw-justify-between tw-items-center">
                            <div className="tw-text-xs tw-text-gray-500">P90</div>
                            <div className="tw-text-xs tw-font-medium">{formatMs(p90)}</div>
                        </div>
                        {maxLatencyP90 > 0 && getLatencyBar(p90, maxLatencyP90, latencyType)}
                    </div>
                )}
            </div>
        </div>
    )
}

export const SessionStatsPage: FC<{
    sessionStats?: AutoeditSessionStats
    statsForLastNRequests?: StatisticsEntry[]
}> = ({ sessionStats, statsForLastNRequests }) => {
    if (!sessionStats) {
        return (
            <div className="tw-p-4 tw-text-center tw-text-gray-500">
                <p>No statistics available for this session.</p>
            </div>
        )
    }

    // Helper function to check if any latency data exists for a metric
    const hasLatencyData = (metric: keyof typeof sessionStats): boolean => {
        const data = sessionStats[metric as keyof AutoeditSessionStats] as any
        return data && (data.p50 > 0 || data.p75 > 0 || data.p90 > 0)
    }

    // Check if any cache hit rate data is available
    const hasCacheHitRateData = (): boolean => {
        return (
            sessionStats.meanCacheHitRate.all > 0 ||
            sessionStats.meanCacheHitRate.suggested > 0 ||
            sessionStats.meanCacheHitRate.readOrAccepted > 0
        )
    }

    // Find maximum latency value for visual scaling
    const maxLatencyP90 = Math.max(
        sessionStats.endToEndLatency.p90 || 0,
        sessionStats.contextLoadedLatency.p90 || 0,
        sessionStats.inferenceLatency.p90 || 0,
        sessionStats.envoyLatency.p90 || 0,
        sessionStats.networkLatency.p90 || 0
    )

    // Check for available latency metrics
    const hasEndToEndLatency = hasLatencyData('endToEndLatency')
    const hasContextLoadedLatency = hasLatencyData('contextLoadedLatency')
    const hasInferenceLatency = hasLatencyData('inferenceLatency')
    const hasEnvoyLatency = hasLatencyData('envoyLatency')
    const hasNetworkLatency = hasLatencyData('networkLatency')

    // Check if we should render the latency section at all
    const hasAnyLatencyData =
        hasEndToEndLatency || hasContextLoadedLatency || hasInferenceLatency || hasEnvoyLatency

    return (
        <div className="tw-p-4">
            {/* Combined Stats Section */}
            {(hasAnyLatencyData || hasCacheHitRateData()) && (
                <div className="tw-mb-8">
                    <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
                        {hasEndToEndLatency && (
                            <LatencyCard
                                title="End-to-End Latency"
                                latencyData={sessionStats.endToEndLatency}
                                latencyType="endToEnd"
                                maxLatencyP90={maxLatencyP90}
                            />
                        )}

                        {hasContextLoadedLatency && (
                            <LatencyCard
                                title="Context Loading"
                                latencyData={sessionStats.contextLoadedLatency}
                                latencyType="contextLoaded"
                                maxLatencyP90={maxLatencyP90}
                            />
                        )}

                        {hasNetworkLatency && (
                            <LatencyCard
                                title="Network Latency"
                                latencyData={sessionStats.networkLatency}
                                latencyType="network"
                                maxLatencyP90={maxLatencyP90}
                            />
                        )}

                        {hasInferenceLatency && (
                            <LatencyCard
                                title="Inference Time"
                                latencyData={sessionStats.inferenceLatency}
                                latencyType="inference"
                                maxLatencyP90={maxLatencyP90}
                            />
                        )}

                        {hasEnvoyLatency && (
                            <LatencyCard
                                title="Envoy Latency"
                                latencyData={sessionStats.envoyLatency}
                                latencyType="envoy"
                                maxLatencyP90={maxLatencyP90}
                            />
                        )}

                        {hasCacheHitRateData() && (
                            <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-4 tw-rounded tw-border tw-border-gray-200 tw-dark:tw-border-gray-700">
                                <h4 className="tw-text-sm tw-font-medium tw-mb-3">Cache Hit Rate</h4>
                                <div className="tw-space-y-3">
                                    {sessionStats.meanCacheHitRate.all > 0 && (
                                        <div>
                                            <div className="tw-flex tw-justify-between tw-items-center">
                                                <div className="tw-text-xs tw-text-gray-500">
                                                    All Requests
                                                </div>
                                                <div className="tw-text-xs tw-font-medium">
                                                    {getCacheHitRateIndicator(
                                                        sessionStats.meanCacheHitRate.all
                                                    )}
                                                    {formatPercent(sessionStats.meanCacheHitRate.all)}
                                                </div>
                                            </div>
                                            {getCacheHitRateBar(sessionStats.meanCacheHitRate.all)}
                                        </div>
                                    )}

                                    {sessionStats.meanCacheHitRate.suggested > 0 && (
                                        <div>
                                            <div className="tw-flex tw-justify-between tw-items-center">
                                                <div className="tw-text-xs tw-text-gray-500">
                                                    Suggested Edits
                                                </div>
                                                <div className="tw-text-xs tw-font-medium">
                                                    {getCacheHitRateIndicator(
                                                        sessionStats.meanCacheHitRate.suggested
                                                    )}
                                                    {formatPercent(
                                                        sessionStats.meanCacheHitRate.suggested
                                                    )}
                                                </div>
                                            </div>
                                            {getCacheHitRateBar(sessionStats.meanCacheHitRate.suggested)}
                                        </div>
                                    )}

                                    {sessionStats.meanCacheHitRate.readOrAccepted > 0 && (
                                        <div>
                                            <div className="tw-flex tw-justify-between tw-items-center">
                                                <div className="tw-text-xs tw-text-gray-500">
                                                    Read/Accepted Edits
                                                </div>
                                                <div className="tw-text-xs tw-font-medium">
                                                    {getCacheHitRateIndicator(
                                                        sessionStats.meanCacheHitRate.readOrAccepted
                                                    )}
                                                    {formatPercent(
                                                        sessionStats.meanCacheHitRate.readOrAccepted
                                                    )}
                                                </div>
                                            </div>
                                            {getCacheHitRateBar(
                                                sessionStats.meanCacheHitRate.readOrAccepted
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {statsForLastNRequests && statsForLastNRequests.length > 0 && (
                <>
                    <RequestMetricsSummary
                        statsForLastNRequests={statsForLastNRequests}
                        numberOfRequests={sessionStats.numberOfRequests}
                    />
                    <LatencyTrendGraph statsForLastNRequests={statsForLastNRequests} />
                </>
            )}

            {/* Legend/Help Section - only show if we have any data to display */}
            {(hasAnyLatencyData || hasCacheHitRateData()) && (
                <div className="tw-mt-8 tw-text-xs tw-text-gray-500 tw-bg-gray-50 tw-dark:tw-bg-gray-900 tw-p-4 tw-rounded tw-border tw-border-gray-200 tw-dark:tw-border-gray-700">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">About these metrics</h4>
                    <div className="tw-space-y-2">
                        {hasAnyLatencyData && (
                            <>
                                <p className="tw-mb-2">
                                    <span className="tw-font-medium">Percentiles:</span> P50 is the
                                    median value, P90 means 90% of requests were faster than this value.
                                </p>
                                {hasEndToEndLatency && (
                                    <p className="tw-mb-2">
                                        <span className="tw-font-medium">End-to-End:</span> Total time
                                        from request initiation to completion.
                                    </p>
                                )}
                                {hasNetworkLatency && (
                                    <p className="tw-mb-2">
                                        <span className="tw-font-medium">Network Latency:</span> Time
                                        from request start to response completion.
                                    </p>
                                )}
                                {hasContextLoadedLatency && (
                                    <p className="tw-mb-2">
                                        <span className="tw-font-medium">Context Loading:</span> Time
                                        client spent gathering prompt context.
                                    </p>
                                )}
                                {hasInferenceLatency && (
                                    <p className="tw-mb-2">
                                        <span className="tw-font-medium">Inference Time:</span> Time
                                        spent by the model generating the response.
                                    </p>
                                )}
                                {hasEnvoyLatency && (
                                    <p className="tw-mb-2">
                                        <span className="tw-font-medium">Envoy Latency:</span> TTFT -
                                        network latency.
                                    </p>
                                )}
                            </>
                        )}

                        {hasCacheHitRateData() && (
                            <p className="tw-mb-2">
                                <span className="tw-font-medium">Cache Hit Rate:</span> Percentage of
                                prompt tokens served from prompt cache instead of requiring a new
                                inference.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

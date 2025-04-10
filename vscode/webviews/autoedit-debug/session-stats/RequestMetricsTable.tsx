import type { FC } from 'react'

import { formatLatency } from '../../../src/autoedits/debug-panel/autoedit-latency-utils'
import type { StatisticsEntry } from '../../../src/autoedits/debug-panel/session-stats'

export const RequestMetricsSummary: FC<{
    statsForLastNRequests: StatisticsEntry[]
    numberOfRequests: number
}> = ({ statsForLastNRequests, numberOfRequests }) => {
    const last20Requests = statsForLastNRequests.slice(0, 20)
    // Check which columns have data
    const hasEndToEndLatency = last20Requests.some(entry => entry.endToEndLatencyMs !== undefined)
    const hasContextLoadedLatency = last20Requests.some(
        entry => entry.contextLoadedLatencyMs !== undefined
    )
    const hasInferenceTime = last20Requests.some(entry => entry.inferenceTimeMs !== undefined)
    const hasEnvoyLatency = last20Requests.some(entry => entry.envoyLatencyMs !== undefined)
    const hasNetworkLatency = last20Requests.some(entry => entry.networkLatencyMs !== undefined)
    const hasCacheHitRate = last20Requests.some(entry => entry.promptCacheHitRate !== undefined)

    // Calculate column configuration with wider phase column to compensate for removed requestId
    const visibleColumns = [
        { id: 'phase', label: 'Phase', always: true },
        { id: 'endToEnd', label: 'End-to-End', visible: hasEndToEndLatency },
        { id: 'contextLoaded', label: 'Context Loaded', visible: hasContextLoadedLatency },
        { id: 'inference', label: 'Inference', visible: hasInferenceTime },
        { id: 'envoy', label: 'Envoy Latency', visible: hasEnvoyLatency },
        { id: 'network', label: 'Network', visible: hasNetworkLatency },
        { id: 'cacheHit', label: 'Cache Hit Rate', visible: hasCacheHitRate },
    ].filter(col => col.always || col.visible)

    return (
        <>
            <div className="tw-mt-6">
                <h4 className="tw-text-md tw-font-medium tw-mb-2">
                    Stats for the last {last20Requests.length} requests
                </h4>
            </div>
            <div className="tw-mt-4 tw-overflow-x-auto">
                <table className="tw-w-full tw-border-collapse tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-lg tw-overflow-hidden tw-shadow-sm">
                    <thead>
                        <tr className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                            {visibleColumns.map(col => (
                                <th
                                    key={col.id}
                                    className="tw-p-2 tw-px-4 tw-text-left tw-font-medium tw-text-xs tw-text-gray-700 tw-dark:tw-text-gray-300"
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {last20Requests.map((entry, index) => (
                            <tr
                                key={`${entry.requestId}-${index}`}
                                className={`${
                                    index % 2 === 0
                                        ? 'tw-bg-gray-50 tw-dark:tw-bg-gray-800/50'
                                        : 'tw-bg-white tw-dark:tw-bg-gray-900'
                                }`}
                            >
                                {/* Phase column - always present */}
                                <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-font-medium tw-text-sm">
                                    {entry.phase}
                                </td>

                                {/* End-to-End latency column */}
                                {hasEndToEndLatency && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.endToEndLatencyMs !== undefined ? (
                                            <span className="tw-font-medium">
                                                {formatLatency(entry.endToEndLatencyMs)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}

                                {/* Context Loaded latency column */}
                                {hasContextLoadedLatency && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.contextLoadedLatencyMs !== undefined ? (
                                            <span className="tw-font-medium">
                                                {formatLatency(entry.contextLoadedLatencyMs)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}

                                {/* Inference Time column */}
                                {hasInferenceTime && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.inferenceTimeMs !== undefined ? (
                                            <span className="tw-font-medium">
                                                {formatLatency(entry.inferenceTimeMs)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}

                                {/* Envoy Latency column */}
                                {hasEnvoyLatency && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.envoyLatencyMs !== undefined ? (
                                            <span className="tw-font-medium">
                                                {formatLatency(entry.envoyLatencyMs)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}

                                {/* Network Latency column */}
                                {hasNetworkLatency && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.networkLatencyMs !== undefined ? (
                                            <span className="tw-font-medium">
                                                {formatLatency(entry.networkLatencyMs)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}

                                {/* Cache Hit Rate column */}
                                {hasCacheHitRate && (
                                    <td className="tw-p-2 tw-px-4 tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700 tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                        {entry.promptCacheHitRate !== undefined ? (
                                            <span className="tw-font-medium">
                                                {entry.promptCacheHitRate.toFixed(2)}%
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {numberOfRequests > last20Requests.length && (
                    <div className="tw-text-xs tw-text-gray-500 tw-mt-2 tw-text-center">
                        Showing {last20Requests.length} most recent requests out of {numberOfRequests}
                    </div>
                )}
            </div>
        </>
    )
}

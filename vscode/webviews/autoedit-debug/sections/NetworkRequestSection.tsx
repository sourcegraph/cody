import React, { type FC } from 'react'

import {
    getHotStreakChunks,
    getModelResponse,
    getStartTime,
    getSuccessModelResponse,
} from '../../../src/autoedits/debug-panel/autoedit-data-sdk'
import {
    PhaseNames,
    getDetailedTimingInfo,
} from '../../../src/autoedits/debug-panel/autoedit-latency-utils'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { JsonViewer } from '../components/JsonViewer'

export const NetworkRequestSection: FC<{
    entry: AutoeditRequestDebugState
}> = ({ entry }) => {
    if (!('payload' in entry.state)) {
        return null
    }

    // Extract modelResponse if available
    const modelResponse = getModelResponse(entry)

    return (
        <div className="tw-grid tw-grid-cols-2 tw-gap-4">
            {/* Display request URL if available */}
            {modelResponse?.requestUrl && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Request URL</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-60 tw-overflow-y-auto">
                        {modelResponse.requestUrl}
                    </div>
                </div>
            )}

            {/* Display request headers if available */}
            {modelResponse?.requestHeaders && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Request Headers</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-160 tw-overflow-y-auto">
                        {Object.entries(modelResponse.requestHeaders).map(([key, value]) => (
                            <div key={key} className="tw-mb-1">
                                <span className="tw-font-medium">{key}:</span>{' '}
                                {key.toLowerCase() === 'authorization' ? '[REDACTED]' : value}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Display request body if available */}
            {modelResponse?.requestBody && (
                <div className="tw-col-span-2 tw-mt-4">
                    <JsonViewer data={modelResponse.requestBody} title="Request Body" maxHeight="80" />
                </div>
            )}
        </div>
    )
}

export const NetworkResponseSection: FC<{
    entry: AutoeditRequestDebugState
}> = ({ entry }) => {
    if (!('payload' in entry.state)) {
        return null
    }

    // Extract modelResponse and hot streak data if available
    const modelResponse = getSuccessModelResponse(entry)
    const hotStreakChunks = getHotStreakChunks(entry)
    const startTime = getStartTime(entry)
    const detailedTimingInfo = getDetailedTimingInfo(entry)

    return (
        <div className="tw-grid tw-grid-cols-2 tw-gap-4">
            {/* Display response headers from modelResponse if available */}
            {modelResponse?.responseHeaders && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Response Headers</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-60 tw-overflow-y-auto">
                        {Object.entries(modelResponse.responseHeaders).map(([key, value]) => (
                            <div key={key} className="tw-mb-1">
                                <span className="tw-font-medium">{key}:</span>{' '}
                                {key.toLowerCase() === 'authorization' ? '[REDACTED]' : value}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Display hot streak chunks if available */}
            {hotStreakChunks && startTime && (
                <div className="tw-col-span-2 tw-mt-4">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Hot Streak Chunks</h4>
                    <div className="tw-grid tw-grid-cols-[auto_1fr] tw-gap-2 tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs">
                        <div className="tw-font-medium">Time</div>
                        <div className="tw-font-medium">Prediction</div>
                        {hotStreakChunks
                            // Filter out empty predictions
                            .filter(chunk => chunk.prediction.trim() !== '')
                            .map((chunk, index, filteredChunks) => {
                                const timeFromStart = Math.round(chunk.loadedAt - startTime)

                                // Calculate time from previous chunk
                                let timeFromPrev: number
                                if (index === 0) {
                                    // First chunk: time from loadedAt
                                    timeFromPrev =
                                        detailedTimingInfo.details.find(
                                            p => p.label === PhaseNames.Network
                                        )?.valueMs ?? 0
                                } else {
                                    // Subsequent chunks: time from previous chunk
                                    timeFromPrev = Math.round(
                                        chunk.loadedAt - filteredChunks[index - 1].loadedAt
                                    )
                                }

                                // Generate a stable key using chunk properties
                                const chunkKey = `chunk-${chunk.prediction.slice(
                                    0,
                                    10
                                )}-${timeFromStart}`

                                return (
                                    <React.Fragment key={chunkKey}>
                                        <div className="tw-font-mono tw-pr-4">
                                            <span className="tw-text-gray-500">{timeFromStart}ms</span>
                                            {index > 0 && (
                                                <span className="tw-text-gray-400 tw-ml-2">
                                                    (+{timeFromPrev}ms)
                                                </span>
                                            )}
                                        </div>
                                        <div className="tw-whitespace-pre-wrap tw-pb-2 tw-border-b tw-border-gray-300 tw-dark:tw-border-gray-600">
                                            {chunk.prediction}
                                        </div>
                                    </React.Fragment>
                                )
                            })}
                    </div>
                </div>
            )}

            {/* Display full prediction immediately after chunks */}
            {hotStreakChunks &&
                hotStreakChunks.length > 0 &&
                hotStreakChunks[hotStreakChunks.length - 1]?.fullPrediction && (
                    <div className="tw-col-span-2 tw-mt-2">
                        <h4 className="tw-text-sm tw-font-medium tw-mb-2">Complete Prediction</h4>
                        <div className="tw-bg-gray-50 tw-dark:tw-bg-gray-700 tw-p-3 tw-rounded tw-text-xs tw-whitespace-pre-wrap tw-border tw-border-green-200 tw-dark:tw-border-green-800">
                            {hotStreakChunks[hotStreakChunks.length - 1].fullPrediction}
                        </div>
                    </div>
                )}

            {/* Display full response body if available */}
            {modelResponse?.responseBody && (
                <div className="tw-col-span-2 tw-mt-4">
                    <JsonViewer
                        data={modelResponse.responseBody}
                        title="Full Response Body"
                        maxHeight="80"
                    />
                </div>
            )}
        </div>
    )
}

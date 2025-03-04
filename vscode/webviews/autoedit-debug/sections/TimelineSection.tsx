import { HelpCircle } from 'lucide-react'
import { type FC, useState } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'

import { getNetworkLatencyInfo } from '../autoedit-data-sdk'
import {
    calculateTimelineWidths,
    calculateTotalDuration,
    createPhaseKey,
    createSegmentKey,
    createTimelineSegments,
    extractPhaseInfo,
    formatLatency,
} from '../autoedit-ui-utils'

interface TimelineSectionProps {
    entry: AutoeditRequestDebugState
}

export const TimelineSection: FC<TimelineSectionProps> = ({ entry }) => {
    // Add state to control tooltip visibility
    const [isTooltipVisible, setIsTooltipVisible] = useState(false)

    // Extract phase information using shared utility
    const phases = extractPhaseInfo(entry)

    // Create segments between phases using shared utility
    const segments = createTimelineSegments(phases)

    // Calculate segment widths for visualization using shared utility
    const segmentWidths = calculateTimelineWidths(segments)

    // Calculate total duration up to and including the suggested phase if available
    const totalPredictionDuration = calculateTotalDuration(phases, 'Suggested')

    // Calculate total duration across all phases
    const totalDuration = calculateTotalDuration(phases)

    // Extract network latency information using the SDK
    const { upstreamLatency, gatewayLatency } = getNetworkLatencyInfo(entry)

    return (
        <div className="tw-flex tw-flex-col tw-gap-y-8">
            {/* Summary of total prediction duration */}
            {totalPredictionDuration > 0 && (
                <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-medium tw-p-3 tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-rounded-md tw-shadow-sm">
                    <span className="tw-text-base">
                        Total suggestion latency:{' '}
                        <span className="tw-font-bold">{formatLatency(totalPredictionDuration)}</span>
                    </span>
                    <div className="tw-relative tw-inline-block">
                        <HelpCircle
                            className="tw-h-4 tw-w-4 tw-text-gray-500 tw-cursor-help"
                            onMouseEnter={() => setIsTooltipVisible(true)}
                            onMouseLeave={() => setIsTooltipVisible(false)}
                        />
                        {isTooltipVisible && (
                            <div className="tw-absolute tw-left-1/2 tw-transform tw--translate-x-1/2 tw-top-6 tw-z-20 tw-w-64 tw-rounded-md tw-shadow-lg tw-bg-gray-800 tw-p-3 tw-text-xs tw-text-white">
                                Total prediction duration is the time from start until the prediction was
                                suggested to the user (including the suggested phase). Post-suggestion
                                phases (read, accepted, rejected) are not included.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Visual Timeline */}
            {segments.length > 0 && (
                <div className="tw-space-y-6">
                    {/* Timeline bar visualization */}
                    <div className="tw-flex tw-h-12 tw-w-full tw-rounded-lg tw-overflow-hidden tw-shadow-sm">
                        {segments.map((segment, index) => (
                            <div
                                key={createSegmentKey(segment)}
                                className={`${segment.color} tw-h-full tw-flex tw-items-center tw-justify-center tw-relative tw-border-r tw-border-white dark:tw-border-gray-800`}
                                style={{ width: `${segmentWidths[index]}%` }}
                                title={`${segment.startPhaseName} → ${segment.name}: ${formatLatency(
                                    segment.duration
                                )}`}
                            >
                                <span className="tw-text-sm tw-font-medium tw-text-white tw-drop-shadow-md">
                                    {formatLatency(segment.duration)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Timeline scale marker */}
                    <div className="tw-flex tw-justify-between tw-text-xs tw-text-gray-500 tw-px-2">
                        <span>Start</span>
                        <span>Total: {formatLatency(totalDuration)}</span>
                    </div>
                </div>
            )}

            {/* Detailed Phase Timestamps */}
            <div className="tw-space-y-4">
                <h3 className="tw-text-base tw-font-medium">Phase Details</h3>
                <div className="tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-lg tw-overflow-hidden">
                    {/* Column Headers */}
                    <div className="tw-grid tw-grid-cols-[2rem_minmax(120px,auto)_minmax(140px,auto)_minmax(140px,auto)] tw-gap-3 tw-p-2 tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-font-medium tw-text-xs tw-text-gray-700 tw-dark:tw-text-gray-300 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                        <div /> {/* Empty column for color indicator */}
                        <div>Phase</div>
                        <div>From Start</div>
                        <div>Phase Duration</div>
                    </div>

                    {/* Phase Rows */}
                    {phases.map((phase, index) => {
                        // Calculate phase duration
                        const phaseDuration =
                            index > 0 ? (phase.time || 0) - (phases[index - 1].time || 0) : 0

                        return (
                            <div
                                key={createPhaseKey(phase)}
                                className={`tw-grid tw-grid-cols-[2rem_minmax(120px,auto)_minmax(140px,auto)_minmax(140px,auto)] tw-gap-3 tw-p-2 tw-items-center ${
                                    index > 0
                                        ? 'tw-border-t tw-border-gray-200 tw-dark:tw-border-gray-700'
                                        : ''
                                } ${index % 2 === 0 ? 'tw-bg-gray-50 tw-dark:tw-bg-gray-800/50' : ''}`}
                            >
                                {/* Color indicator */}
                                <div className="tw-flex tw-justify-center">
                                    <div
                                        className={`${phase.color} tw-w-4 tw-h-4 tw-rounded-md tw-flex-shrink-0`}
                                    />
                                </div>

                                {/* Phase name */}
                                <div className="tw-font-medium tw-text-sm">{phase.name}</div>

                                {/* From start time */}
                                <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                    {index === 0 ? (
                                        '—'
                                    ) : (
                                        <span className="tw-font-medium">
                                            {formatLatency((phase?.time ?? 0) - (phases[0]?.time ?? 0))}
                                        </span>
                                    )}
                                </div>

                                {/* Phase duration */}
                                <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                    {index === 0 ? (
                                        '—'
                                    ) : (
                                        <span className="tw-font-medium">
                                            {formatLatency(phaseDuration)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Network Latency Details */}
            {(upstreamLatency !== undefined || gatewayLatency !== undefined) && (
                <div className="tw-space-y-4">
                    <h3 className="tw-text-base tw-font-medium">Network Latency</h3>
                    <div className="tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-lg tw-overflow-hidden">
                        {/* Column Headers */}
                        <div className="tw-grid tw-grid-cols-[2rem_minmax(120px,auto)_minmax(140px,auto)_minmax(140px,auto)] tw-gap-3 tw-p-2 tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-font-medium tw-text-xs tw-text-gray-700 tw-dark:tw-text-gray-300 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                            <div /> {/* Empty column for alignment with color indicator */}
                            <div>Service</div>
                            <div>Round Trip Time</div>
                            <div /> {/* Empty column to match Phase Duration */}
                        </div>

                        {/* Upstream Latency Row */}
                        {upstreamLatency !== undefined && (
                            <div className="tw-grid tw-grid-cols-[2rem_minmax(120px,auto)_minmax(140px,auto)_minmax(140px,auto)] tw-gap-3 tw-p-2 tw-items-center tw-bg-gray-50 tw-dark:tw-bg-gray-800/50">
                                <div className="tw-flex tw-justify-center">
                                    <div className="tw-bg-gray-500 tw-w-4 tw-h-4 tw-rounded-md tw-flex-shrink-0" />
                                </div>
                                <div className="tw-font-medium tw-text-sm">Sourcegraph API</div>
                                <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                    <span className="tw-font-medium">
                                        {formatLatency(upstreamLatency)}
                                    </span>
                                </div>
                                <div /> {/* Empty column for alignment */}
                            </div>
                        )}

                        {/* Gateway Latency Row */}
                        {gatewayLatency !== undefined && (
                            <div className="tw-grid tw-grid-cols-[2rem_minmax(120px,auto)_minmax(140px,auto)_minmax(140px,auto)] tw-gap-3 tw-p-2 tw-items-center tw-bg-white tw-dark:tw-bg-gray-900">
                                <div className="tw-flex tw-justify-center">
                                    <div className="tw-bg-gray-500 tw-w-4 tw-h-4 tw-rounded-md tw-flex-shrink-0" />
                                </div>
                                <div className="tw-font-medium tw-text-sm">Cody Gateway</div>
                                <div className="tw-text-xs tw-text-gray-600 tw-dark:tw-text-gray-400">
                                    <span className="tw-font-medium">
                                        {formatLatency(gatewayLatency)}
                                    </span>
                                </div>
                                <div /> {/* Empty column to match Phase Duration */}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

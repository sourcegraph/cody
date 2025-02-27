import { Clock } from 'lucide-react'
import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { calculateDuration, formatTime } from './utils'

interface TimelineSectionProps {
    entry: AutoeditRequestDebugState
}

export const TimelineSection: FC<TimelineSectionProps> = ({ entry }) => {
    // Helper to get start time, which might be in different properties based on state phase
    const getStartTime = (entry: AutoeditRequestDebugState): number => {
        const { state } = entry
        if ('startedAt' in state) {
            return state.startedAt
        }
        return entry.updatedAt
    }

    // Get the timestamp of the previous phase based on the current phase
    const getPreviousPhaseTime = (currentPhase: string): number => {
        const startTime = getStartTime(entry)

        if (currentPhase === 'loadedAt') {
            return startTime
        }

        if (currentPhase === 'suggestedAt' && 'loadedAt' in entry.state) {
            return entry.state.loadedAt
        }

        if (currentPhase === 'readAt' && 'suggestedAt' in entry.state) {
            return entry.state.suggestedAt
        }

        if (currentPhase === 'acceptedAt') {
            if ('readAt' in entry.state && entry.state.readAt) {
                return entry.state.readAt
            }
            if ('suggestedAt' in entry.state) {
                return entry.state.suggestedAt
            }
        }

        return startTime
    }

    // Calculate timeline data
    const startTime = getStartTime(entry)
    const endTime = entry.updatedAt
    const totalDuration = endTime - startTime

    // Get all timestamps in chronological order for the timeline
    const timelineEvents = [
        {
            name: 'Started',
            time: startTime,
            color: 'tw-bg-gray-300',
            fromStart: 0,
            fromPrevious: 0,
        },
    ]

    if ('loadedAt' in entry.state) {
        timelineEvents.push({
            name: 'Loaded',
            time: entry.state.loadedAt,
            color: 'tw-bg-blue-300',
            fromStart: entry.state.loadedAt - startTime,
            fromPrevious: entry.state.loadedAt - getPreviousPhaseTime('loadedAt'),
        })
    }

    if ('suggestedAt' in entry.state) {
        timelineEvents.push({
            name: 'Suggested',
            time: entry.state.suggestedAt,
            color: 'tw-bg-purple-300',
            fromStart: entry.state.suggestedAt - startTime,
            fromPrevious: entry.state.suggestedAt - getPreviousPhaseTime('suggestedAt'),
        })
    }

    if ('readAt' in entry.state && entry.state.readAt) {
        timelineEvents.push({
            name: 'Read',
            time: entry.state.readAt,
            color: 'tw-bg-teal-300',
            fromStart: entry.state.readAt - startTime,
            fromPrevious: entry.state.readAt - getPreviousPhaseTime('readAt'),
        })
    }

    if ('acceptedAt' in entry.state) {
        timelineEvents.push({
            name: 'Accepted',
            time: entry.state.acceptedAt,
            color: 'tw-bg-green-300',
            fromStart: entry.state.acceptedAt - startTime,
            fromPrevious: entry.state.acceptedAt - getPreviousPhaseTime('acceptedAt'),
        })
    }

    // Sort events by time
    timelineEvents.sort((a, b) => a.time - b.time)

    // Calculate width percentages for each segment
    interface Segment {
        name: string
        color: string
        percentage: number
        duration: number
        time: number
        prevTime: number
        visualPercentage?: number
    }

    const segments: Segment[] = []
    for (let i = 1; i < timelineEvents.length; i++) {
        const prevEvent = timelineEvents[i - 1]
        const currEvent = timelineEvents[i]
        const duration = currEvent.time - prevEvent.time
        const percentage = (duration / totalDuration) * 100
        segments.push({
            name: currEvent.name,
            color: currEvent.color,
            percentage,
            duration,
            time: currEvent.time,
            prevTime: prevEvent.time,
        })
    }

    // Adjust the widths to handle very small segments while preserving relative proportions
    const MIN_VISUAL_PERCENT = 3 // Minimum visual percentage for tiny segments

    // If we have multiple segments
    if (segments.length > 0) {
        // Get the smallest percentage that's not zero
        const smallestPercentage = Math.min(
            ...segments.map(s => s.percentage || Number.POSITIVE_INFINITY)
        )

        // If the smallest percentage is very small, adjust the scale
        if (smallestPercentage < MIN_VISUAL_PERCENT) {
            // Calculate a scale factor that will make the smallest segment visible
            // while preserving the relative proportions of other segments
            const scaleFactor = MIN_VISUAL_PERCENT / smallestPercentage

            // Apply the scaling to all segments that are small
            for (const segment of segments) {
                if (segment.percentage < MIN_VISUAL_PERCENT) {
                    segment.visualPercentage = segment.percentage * scaleFactor
                } else {
                    segment.visualPercentage = segment.percentage
                }
            }

            // Calculate how much the scaled segments now take up
            const totalVisualPercentage = segments.reduce((sum, s) => sum + (s.visualPercentage || 0), 0)

            // If we've exceeded 100%, scale everything back proportionally
            if (totalVisualPercentage > 100) {
                const normalizationFactor = 100 / totalVisualPercentage
                for (const segment of segments) {
                    if (segment.visualPercentage) {
                        segment.visualPercentage *= normalizationFactor
                    }
                }
            }
        } else {
            // If no tiny segments, just use the actual percentages
            for (const segment of segments) {
                segment.visualPercentage = segment.percentage
            }
        }
    }

    return (
        <div className="tw-flex tw-flex-col tw-gap-4">
            {/* Visual Timeline */}
            <div className="tw-bg-gray-100 tw-p-4 tw-rounded-md">
                <h3 className="tw-text-sm tw-font-medium tw-mb-2">Timeline Visualization</h3>
                <div className="tw-flex tw-flex-row tw-items-center tw-h-10 tw-rounded-md tw-overflow-hidden tw-w-full">
                    {segments.map((segment, index) => {
                        const duration = calculateDuration(segment.prevTime, segment.time)
                        return (
                            <div
                                key={segment.name}
                                className={`${segment.color} tw-h-full tw-flex tw-items-center tw-justify-center tw-text-xs tw-relative tw-overflow-hidden`}
                                style={{ width: `${segment.visualPercentage}%` }}
                                title={`${segment.name}: ${formatTime(
                                    segment.time
                                )} (${duration}) - ${segment.percentage.toFixed(1)}% of total time`}
                            >
                                <div className="tw-px-1 tw-truncate tw-max-w-full">
                                    <span className="tw-font-medium">{segment.name}</span>
                                    <span className="tw-ml-1">({duration})</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div className="tw-flex tw-justify-between tw-text-xs tw-text-gray-500 tw-mt-1">
                    <span>{formatTime(startTime)}</span>
                    <span>{formatTime(endTime)}</span>
                </div>
                <div className="tw-text-xs tw-text-gray-500 tw-mt-1 tw-text-center">
                    Total duration: {calculateDuration(startTime, endTime)}
                </div>
            </div>

            {/* Detailed Timeline */}
            <div className="tw-flex tw-flex-col tw-gap-2">
                <h3 className="tw-text-sm tw-font-medium">Detailed Timing</h3>

                {timelineEvents.map((event, index) => (
                    <div key={event.name} className="tw-flex tw-items-center tw-gap-2">
                        <Clock className="tw-h-4 tw-w-4" />
                        {index > 0 && (
                            <div
                                className={`${event.color} tw-w-3 tw-h-3 tw-rounded-sm`}
                                title={event.name}
                            />
                        )}
                        <span className="tw-font-medium tw-min-w-20">{event.name}:</span>
                        <span>{formatTime(event.time)}</span>
                        <span className="tw-text-xs tw-text-gray-500">
                            {index === 0
                                ? '(reference point)'
                                : `(from start: ${calculateDuration(
                                      startTime,
                                      event.time
                                  )}, from previous: ${calculateDuration(
                                      timelineEvents[index - 1].time,
                                      event.time
                                  )})`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

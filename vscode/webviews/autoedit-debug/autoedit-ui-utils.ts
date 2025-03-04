import type { Phase } from '../../src/autoedits/analytics-logger/types'
import type { AutoeditRequestDebugState } from '../../src/autoedits/debugging/debug-store'

/**
 * Map of discard reason codes to human-readable messages
 */
export const DISCARD_REASONS: Record<number, string> = {
    1: 'Client Aborted',
    2: 'Empty Prediction',
    3: 'Prediction Equals Code to Rewrite',
    4: 'Recent Edits',
    5: 'Suffix Overlap',
    6: 'Empty Prediction After Inline Completion Extraction',
    7: 'No Active Editor',
    8: 'Conflicting Decoration With Edits',
    9: 'Not Enough Lines in Editor',
}

/**
 * Format timestamp as a readable date
 */
export const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
}

/**
 * Format latency as a readable duration with appropriate units (ms/s/m)
 */
export const formatLatency = (milliseconds: number | undefined): string => {
    if (milliseconds === undefined) {
        return 'unknown'
    }

    // Format with appropriate unit based on size
    if (milliseconds < 1) {
        return '< 1ms'
    }
    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)}ms`
    }
    if (milliseconds < 60000) {
        return `${(milliseconds / 1000).toFixed(1)}s`
    }
    const minutes = Math.floor(milliseconds / 60000)
    const seconds = ((milliseconds % 60000) / 1000).toFixed(1)
    return `${minutes}m ${seconds}s`
}

/**
 * Calculate time duration between two timestamps
 */
export const calculateDuration = (start: number | undefined, end: number | undefined): string => {
    if (typeof start !== 'number' || typeof end !== 'number') {
        return 'unknown'
    }
    return formatLatency(end - start)
}

/**
 * Get status badge color based on phase
 */
export const getStatusColor = (phase: Phase): string => {
    switch (phase) {
        case 'started':
            return 'tw-bg-yellow-200 tw-text-yellow-800'
        case 'contextLoaded':
            return 'tw-bg-blue-200 tw-text-blue-800'
        case 'loaded':
            return 'tw-bg-indigo-200 tw-text-indigo-800'
        case 'postProcessed':
            return 'tw-bg-purple-200 tw-text-purple-800'
        case 'suggested':
            return 'tw-bg-fuchsia-200 tw-text-fuchsia-800'
        case 'read':
            return 'tw-bg-teal-200 tw-text-teal-800'
        case 'accepted':
            return 'tw-bg-green-200 tw-text-green-800'
        case 'rejected':
            return 'tw-bg-red-200 tw-text-red-800'
        case 'discarded':
            return 'tw-bg-gray-200 tw-text-gray-800'
        default:
            return 'tw-bg-gray-200 tw-text-gray-800'
    }
}

/**
 * Extract all phase timing information from an autoedit entry
 */
export const extractPhaseInfo = (entry: AutoeditRequestDebugState) => {
    const { state } = entry
    const startTime = 'startedAt' in state ? state.startedAt : entry.updatedAt

    // Define all possible phase transitions in order with alternating color families for better visibility
    const phases: Array<{
        name: string
        time?: number
        color: string
    }> = [
        { name: 'Start', time: startTime, color: 'tw-bg-gray-500' },
        {
            name: 'Context Loaded',
            time: 'contextLoadedAt' in state ? state.contextLoadedAt : undefined,
            color: 'tw-bg-amber-500',
        },
        {
            name: 'Loaded',
            time: 'loadedAt' in state ? state.loadedAt : undefined,
            color: 'tw-bg-blue-500',
        },
        {
            name: 'Post Processed',
            time: 'postProcessedAt' in state ? state.postProcessedAt : undefined,
            color: 'tw-bg-purple-500',
        },
        {
            name: 'Suggested',
            time: 'suggestedAt' in state ? state.suggestedAt : undefined,
            color: 'tw-bg-pink-500',
        },
        {
            name: 'Read',
            time: 'readAt' in state ? state.readAt : undefined,
            color: 'tw-bg-cyan-500',
        },
        {
            name: 'Accepted',
            time: 'acceptedAt' in state ? state.acceptedAt : undefined,
            color: 'tw-bg-green-500',
        },
        {
            name: 'Rejected',
            time: 'rejectedAt' in state ? state.rejectedAt : undefined,
            color: 'tw-bg-red-500',
        },
        {
            name: 'Discarded',
            time:
                'discardedAt' in state
                    ? state.discardedAt
                    : entry.state.phase === 'discarded'
                      ? entry.updatedAt
                      : undefined,
            color: 'tw-bg-rose-600',
        },
    ]

    // Filter out phases that didn't occur
    const validPhases = phases.filter(phase => phase.time !== undefined)

    // Sort phases by time
    validPhases.sort((a, b) => (a.time || 0) - (b.time || 0))

    return validPhases
}

/**
 * Create segments between phases for visualization
 */
export const createTimelineSegments = (
    phases: Array<{ name: string; time?: number; color: string }>
) => {
    const segments: Array<{
        name: string
        startTime: number
        endTime: number
        duration: number
        color: string
        startPhaseName: string
    }> = []

    // Create a segment between each consecutive phase
    for (let i = 0; i < phases.length - 1; i++) {
        const startPhase = phases[i]
        const endPhase = phases[i + 1]

        segments.push({
            name: endPhase.name,
            startPhaseName: startPhase.name,
            startTime: startPhase.time || 0,
            endTime: endPhase.time || 0,
            duration: (endPhase.time || 0) - (startPhase.time || 0),
            color: endPhase.color,
        })
    }

    return segments
}

/**
 * Calculate logical widths for the timeline segments
 */
export const calculateTimelineWidths = (segments: Array<{ duration: number }>) => {
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0)

    // If the smallest segment is less than 5% of the total, use a minimum width approach
    const MIN_WIDTH_PERCENT = 5
    const smallestSegmentPercentage = Math.min(...segments.map(s => (s.duration / totalDuration) * 100))

    if (smallestSegmentPercentage < MIN_WIDTH_PERCENT) {
        // Apply minimum width to small segments and distribute the rest proportionally
        const smallSegments = segments.filter(
            s => (s.duration / totalDuration) * 100 < MIN_WIDTH_PERCENT
        )
        const smallSegmentsCount = smallSegments.length

        // Total percentage allocated to small segments
        const smallSegmentsPercentage = MIN_WIDTH_PERCENT * smallSegmentsCount

        // Remaining percentage for normal segments
        const remainingPercentage = 100 - smallSegmentsPercentage

        // Total duration of normal segments
        const normalSegmentsDuration = segments
            .filter(s => (s.duration / totalDuration) * 100 >= MIN_WIDTH_PERCENT)
            .reduce((sum, s) => sum + s.duration, 0)

        return segments.map(segment => {
            if ((segment.duration / totalDuration) * 100 < MIN_WIDTH_PERCENT) {
                return MIN_WIDTH_PERCENT
            }
            return (segment.duration / normalSegmentsDuration) * remainingPercentage
        })
    }

    // All segments are big enough, use proportional widths
    return segments.map(segment => (segment.duration / totalDuration) * 100)
}

/**
 * Calculate the total duration up to a specific phase (or the end)
 */
export const calculateTotalDuration = (
    phases: Array<{ name: string; time?: number }>,
    upToPhase?: string
) => {
    if (phases.length < 1) {
        return 0
    }

    const startTime = phases[0]?.time ?? 0

    // If upToPhase is specified, find that phase
    if (upToPhase) {
        const targetPhase = phases.find(phase => phase.name === upToPhase)
        if (targetPhase?.time) {
            return targetPhase.time - startTime
        }
    }

    // Otherwise use the last phase
    return phases.length > 1 ? (phases[phases.length - 1]?.time ?? 0) - startTime : 0
}

/**
 * Get detailed timing information from an entry
 * Returns an object with predictionDuration (time from start to suggested phase) and detailed timing breakdowns
 */
export const getDetailedTimingInfo = (
    entry: AutoeditRequestDebugState
): {
    predictionDuration: string
    details: Array<{ label: string; value: string }>
} => {
    const result = {
        predictionDuration: '',
        details: [] as Array<{ label: string; value: string }>,
    }

    // Calculate time from start to suggested phase (prediction duration)
    // This matches the calculation in TimelineSection
    const phases = extractPhaseInfo(entry)
    const predictionDurationMs = calculateTotalDuration(phases, 'Suggested')

    if (predictionDurationMs > 0) {
        result.predictionDuration = formatLatency(predictionDurationMs)
    } else if ('payload' in entry.state && 'latency' in entry.state.payload) {
        // Fallback to payload latency only if we couldn't calculate directly
        result.predictionDuration = formatLatency(entry.state.payload.latency)
    } else {
        result.predictionDuration = 'unknown'
    }

    // Add detailed timing breakdowns
    const state = entry.state
    const startTime = 'startedAt' in state ? state.startedAt : undefined

    if (startTime !== undefined) {
        // Context loading time
        if ('contextLoadedAt' in state) {
            result.details.push({
                label: 'Context Loading',
                value: calculateDuration(startTime, state.contextLoadedAt),
            })
        }

        // Model generation time
        if ('contextLoadedAt' in state && 'loadedAt' in state) {
            result.details.push({
                label: 'Model Generation',
                value: calculateDuration(state.contextLoadedAt, state.loadedAt),
            })
        }

        // Post-processing time
        if ('loadedAt' in state && 'postProcessedAt' in state) {
            result.details.push({
                label: 'Post-processing',
                value: calculateDuration(state.loadedAt, state.postProcessedAt),
            })
        }

        // Time to suggest
        if ('postProcessedAt' in state && 'suggestedAt' in state) {
            result.details.push({
                label: 'Time to Suggest',
                value: calculateDuration(state.postProcessedAt, state.suggestedAt),
            })
        }

        // Gateway latency if available
        if ('payload' in state && 'gatewayLatency' in state.payload && state.payload.gatewayLatency) {
            result.details.push({
                label: 'Gateway Latency',
                value: formatLatency(state.payload.gatewayLatency),
            })
        }

        // Upstream latency if available
        if ('payload' in state && 'upstreamLatency' in state.payload && state.payload.upstreamLatency) {
            result.details.push({
                label: 'Upstream Latency',
                value: formatLatency(state.payload.upstreamLatency),
            })
        }
    }

    return result
}

/**
 * Helper functions to generate keys for React components
 */
export const createSegmentKey = (segment: {
    name: string
    startTime: number
    endTime: number
}): string => {
    return `${segment.name}-${segment.startTime}-${segment.endTime}`
}

export const createPhaseKey = (phase: { name: string; time?: number }): string => {
    return `${phase.name}-${phase.time || 'undefined'}`
}

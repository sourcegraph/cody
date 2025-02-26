import type { Phase } from '../../../src/autoedits/analytics-logger/types'

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
 * Format latency as a readable duration
 */
export const formatLatency = (milliseconds: number | undefined): string => {
    if (milliseconds === undefined) {
        return 'unknown'
    }
    return `${milliseconds}ms`
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

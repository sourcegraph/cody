import type { Phase } from '../../src/autoedits/analytics-logger/types'
import type { PhaseNames } from '../../src/autoedits/debug-panel/autoedit-latency-utils'

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
 * Get color for phase in timeline visualizations
 */
export const getPhaseColor = (phaseName: PhaseNames): string => {
    switch (phaseName) {
        case 'Start':
            return 'tw-bg-gray-500'
        case 'Context Loaded':
            return 'tw-bg-amber-500'
        case 'Inference':
            return 'tw-bg-indigo-500'
        case 'Network':
            return 'tw-bg-blue-500'
        case 'Post Processed':
            return 'tw-bg-purple-500'
        case 'Suggested':
            return 'tw-bg-pink-500'
        case 'Read':
            return 'tw-bg-cyan-500'
        case 'Accepted':
            return 'tw-bg-green-500'
        case 'Rejected':
            return 'tw-bg-red-500'
        case 'Discarded':
            return 'tw-bg-rose-600'
        default:
            return 'tw-bg-gray-500'
    }
}

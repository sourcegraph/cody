import { getModelResponse } from './autoedit-data-sdk'
import type { AutoeditRequestDebugState } from './debug-store'

export const extractPromptCacheHitRate = (entry: AutoeditRequestDebugState): number | undefined => {
    const modelResponse = getModelResponse(entry)

    if (modelResponse && 'responseHeaders' in modelResponse) {
        const cachedTokens = modelResponse.responseHeaders['fireworks-cached-prompt-tokens']
        const totalTokens = modelResponse.responseHeaders['fireworks-prompt-tokens']

        if (cachedTokens && totalTokens) {
            return (Number(cachedTokens) / Number(totalTokens)) * 100
        }
    }

    return undefined
}

/**
 * Possible phase names in the auto-edit process
 */
export enum PhaseNames {
    Start = 'Start',
    ContextLoaded = 'Context Loaded',
    Inference = 'Inference',
    Network = 'Network',
    PostProcessed = 'Post Processed',
    Suggested = 'Suggested',
    Read = 'Read',
    Accepted = 'Accepted',
    Rejected = 'Rejected',
    Discarded = 'Discarded',
}

export interface PhaseInfo {
    name: PhaseNames
    time?: number
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
 * Extract all phase timing information from an autoedit entry
 */
export const extractPhaseInfo = (entry: AutoeditRequestDebugState): PhaseInfo[] => {
    const { state } = entry
    const startTime = 'startedAt' in state ? state.startedAt : entry.updatedAt
    const inferenceTime = extractInferenceTime(state)

    // Define all possible phase transitions in order with colors from the separate module
    const phases: PhaseInfo[] = [
        { name: PhaseNames.Start, time: startTime },
        {
            name: PhaseNames.ContextLoaded,
            time: 'contextLoadedAt' in state ? state.contextLoadedAt : undefined,
        },
    ]

    // Add Inference Time phase if it exists
    // We're treating contextLoadedAt as the start of inference
    // and the inference end as the start of the loaded phase
    if (inferenceTime > 0 && 'contextLoadedAt' in state && 'loadedAt' in state) {
        // Inference starts at contextLoadedAt
        const inferenceEndTime = state.contextLoadedAt + inferenceTime

        // Add the inference end phase, which should come right before loaded
        phases.push({
            name: PhaseNames.Inference,
            time: inferenceEndTime,
        })
    }

    // Continue with the rest of the phases
    phases.push(
        {
            name: PhaseNames.Network,
            time: 'loadedAt' in state ? state.loadedAt : undefined,
        },
        {
            name: PhaseNames.PostProcessed,
            time: 'postProcessedAt' in state ? state.postProcessedAt : undefined,
        },
        {
            name: PhaseNames.Suggested,
            time: 'suggestedAt' in state ? state.suggestedAt : undefined,
        },
        {
            name: PhaseNames.Read,
            time: 'readAt' in state ? state.readAt : undefined,
        },
        {
            name: PhaseNames.Accepted,
            time: 'acceptedAt' in state ? state.acceptedAt : undefined,
        },
        {
            name: PhaseNames.Rejected,
            time: 'rejectedAt' in state ? state.rejectedAt : undefined,
        },
        {
            name: PhaseNames.Discarded,
            time:
                'discardedAt' in state
                    ? state.discardedAt
                    : entry.state.phase === 'discarded'
                      ? entry.updatedAt
                      : undefined,
        }
    )

    // Filter out phases that didn't occur
    const validPhases = phases.filter(phase => phase.time !== undefined)

    // Sort phases by time
    validPhases.sort((a, b) => (a.time || 0) - (b.time || 0))

    return validPhases
}

export const extractInferenceTime = (state: Record<string, any>): number => {
    let inferenceTime = 0

    if (
        'modelResponse' in state &&
        state.modelResponse?.responseHeaders?.['fireworks-server-processing-time']
    ) {
        inferenceTime =
            Number.parseFloat(state.modelResponse.responseHeaders['fireworks-server-processing-time']) *
            1000

        if (Number.isNaN(inferenceTime)) {
            inferenceTime = 0
        }
    }

    return inferenceTime
}

export const extractEnvoyUpstreamServiceTime = (state: Record<string, any>): number => {
    let envoyUpstreamServiceTime = 0

    if (
        'modelResponse' in state &&
        state.modelResponse?.responseHeaders?.['x-envoy-upstream-service-time']
    ) {
        envoyUpstreamServiceTime = Number.parseFloat(
            state.modelResponse.responseHeaders['x-envoy-upstream-service-time']
        )

        if (Number.isNaN(envoyUpstreamServiceTime)) {
            envoyUpstreamServiceTime = 0
        }
    }

    return envoyUpstreamServiceTime
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

export interface DetailedTimingInfo {
    predictionDuration: string
    predictionDurationMs?: number
    inferenceTime?: string
    inferenceTimeMs?: number
    envoyUpstreamServiceTime?: string
    envoyUpstreamServiceTimeMs?: number
    details: Array<{
        label: PhaseNames | string
        value: string
        valueMs: number
    }>
}

/**
 * Get detailed timing information from an entry
 * Returns an object with predictionDuration (time from start to suggested phase) and detailed timing breakdowns
 */
export const getDetailedTimingInfo = (entry: AutoeditRequestDebugState): DetailedTimingInfo => {
    const result: DetailedTimingInfo = {
        predictionDuration: '',
        inferenceTime: undefined,
        details: [] as Array<{
            label: PhaseNames | string
            value: string
            valueMs: number
        }>,
    }

    // Calculate time from start to suggested phase (prediction duration)
    // This matches the calculation in TimelineSection
    const phases = extractPhaseInfo(entry)
    const predictionDurationMs = calculateTotalDuration(phases, PhaseNames.Suggested)

    if (predictionDurationMs > 0) {
        result.predictionDuration = formatLatency(predictionDurationMs)
        result.predictionDurationMs = predictionDurationMs
    } else if ('payload' in entry.state && 'latency' in entry.state.payload) {
        // Fallback to payload latency only if we couldn't calculate directly
        const payloadLatency = entry.state.payload.latency
        result.predictionDuration = formatLatency(payloadLatency)
        result.predictionDurationMs = payloadLatency
    } else {
        result.predictionDuration = 'unknown'
    }

    // Add detailed timing breakdowns
    const state = entry.state
    const startTime = 'startedAt' in state ? state.startedAt : undefined

    // Extract inference time and format it
    const inferenceTimeMs = extractInferenceTime(state)
    if (inferenceTimeMs > 0) {
        result.inferenceTime = formatLatency(inferenceTimeMs)
        result.inferenceTimeMs = inferenceTimeMs
    }

    const envoyUpstreamServiceTimeMs = extractEnvoyUpstreamServiceTime(state)
    if (envoyUpstreamServiceTimeMs > 0) {
        result.envoyUpstreamServiceTime = formatLatency(envoyUpstreamServiceTimeMs)
        result.envoyUpstreamServiceTimeMs = envoyUpstreamServiceTimeMs
    }

    if (startTime !== undefined) {
        // Context loading time
        if ('contextLoadedAt' in state) {
            const contextLoadingMs = state.contextLoadedAt - startTime
            result.details.push({
                label: PhaseNames.ContextLoaded,
                value: calculateDuration(startTime, state.contextLoadedAt),
                valueMs: contextLoadingMs,
            })
        }

        // Model generation time
        if ('contextLoadedAt' in state && 'loadedAt' in state) {
            // Calculate model generation time and subtract inference time if available
            let modelGenerationTime = state.loadedAt - state.contextLoadedAt

            if (inferenceTimeMs > 0) {
                modelGenerationTime -= inferenceTimeMs

                result.details.push({
                    label: PhaseNames.Inference,
                    value: formatLatency(inferenceTimeMs),
                    valueMs: inferenceTimeMs,
                })
            } else if (envoyUpstreamServiceTimeMs > 0) {
                modelGenerationTime -= envoyUpstreamServiceTimeMs

                result.details.push({
                    label: 'Envoy Latency',
                    value: formatLatency(envoyUpstreamServiceTimeMs),
                    valueMs: envoyUpstreamServiceTimeMs,
                })
            }

            // Ensure model generation time is never negative
            const networkTimeMs = Math.max(0, modelGenerationTime)
            result.details.push({
                label: PhaseNames.Network,
                value: formatLatency(networkTimeMs),
                valueMs: networkTimeMs,
            })
        }

        // Post-processing time
        if ('loadedAt' in state && 'postProcessedAt' in state) {
            const postProcessingMs = state.postProcessedAt - state.loadedAt
            result.details.push({
                label: PhaseNames.PostProcessed,
                value: calculateDuration(state.loadedAt, state.postProcessedAt),
                valueMs: postProcessingMs,
            })
        }

        // Time to suggest
        if ('postProcessedAt' in state && 'suggestedAt' in state) {
            const timeToSuggestMs = state.suggestedAt - state.postProcessedAt
            result.details.push({
                label: PhaseNames.Suggested,
                value: calculateDuration(state.postProcessedAt, state.suggestedAt),
                valueMs: timeToSuggestMs,
            })
        }

        // Gateway latency if available
        if ('payload' in state && 'gatewayLatency' in state.payload && state.payload.gatewayLatency) {
            const gatewayLatencyMs = state.payload.gatewayLatency
            result.details.push({
                label: 'Gateway Latency',
                value: formatLatency(gatewayLatencyMs),
                valueMs: gatewayLatencyMs,
            })
        }

        // Upstream latency if available
        if ('payload' in state && 'upstreamLatency' in state.payload && state.payload.upstreamLatency) {
            const upstreamLatencyMs = state.payload.upstreamLatency
            result.details.push({
                label: 'Upstream Latency',
                value: formatLatency(upstreamLatencyMs),
                valueMs: upstreamLatencyMs,
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

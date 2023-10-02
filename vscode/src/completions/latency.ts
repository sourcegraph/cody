import { logDebug } from '../log'

export const defaultLatency = {
    baseline: 400,
    user: 200, // set to 0 on reset after accepting suggestion or after 5 mins
    lowPerformance: 1000,
    max: 2000,
}

// Languages with lower performance get additional latency to avoid spamming users with unhelpful suggestions
const lowPerformanceLanguageIds = new Set(['css', 'html', 'scss', 'vue', 'dart', 'json', 'yaml', 'postcss'])

let userMetrics = {
    sessionTimestamp: 0,
    currentLatency: 0,
    suggested: 0,
    fileName: '',
}

// Adjust the minimum latency based on user actions and env
// Start when the last 5 suggestions were not accepted
// Increment latency by 200ms linearly up to max latency
// Reset every 5 minutes, or on file change, or on accepting a suggestion
export function getLatency(provider: string, fileName: string, languageId?: string): number {
    let baseline = provider === 'anthropic' ? 0 : defaultLatency.baseline
    // set base latency based on provider and low performance languages
    if (!languageId || (languageId && lowPerformanceLanguageIds.has(languageId))) {
        baseline += defaultLatency.lowPerformance
    }

    const timestamp = Date.now()
    if (!userMetrics.sessionTimestamp) {
        userMetrics.sessionTimestamp = timestamp
    }

    const elapsed = timestamp - userMetrics.sessionTimestamp
    // reset metrics and timer after 5 minutes or file change
    if (elapsed >= 5 * 60 * 1000 || userMetrics.fileName !== fileName) {
        resetLatency()
    }

    userMetrics.suggested++
    userMetrics.fileName = fileName

    // Start after 5 rejected suggestions
    if (userMetrics.suggested < 5) {
        return baseline
    }

    const total = Math.max(baseline, Math.min(baseline + userMetrics.currentLatency, defaultLatency.max))

    userMetrics.currentLatency += defaultLatency.user

    logDebug('CodyCompletionProvider:getLatency', `Applied Latency: ${total}`)

    return total
}

// reset user latency and counter:
// - on acceptance
// - every 5 minutes
// - on file change
export function resetLatency(): void {
    userMetrics = {
        sessionTimestamp: 0,
        currentLatency: 0,
        suggested: 0,
        fileName: '',
    }
    logDebug('CodyCompletionProvider:resetLatency', 'Latency reset')
}

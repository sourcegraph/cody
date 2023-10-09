import { logDebug } from '../log'

export const defaultLatency = {
    baseline: 400,
    user: 200,
    lowPerformance: 1000,
    max: 2000,
}

// Languages with lower performance get additional latency to avoid spamming users with unhelpful suggestions
export const lowPerformanceLanguageIds = new Set([
    'css',
    'html',
    'scss',
    'vue',
    'dart',
    'json',
    'yaml',
    'postcss',
    'markdown',
    'plaintext',
    'xml',
])

let userMetrics = {
    sessionTimestamp: 0,
    currentLatency: 0,
    suggested: 0,
    fsPath: '',
}

// Adjust the minimum latency based on user actions and env
// Start when the last 5 suggestions were not accepted
// Increment latency by 200ms linearly up to max latency
// Reset every 5 minutes, or on file change, or on accepting a suggestion
export function getLatency(
    lowPerformanceLanguagesOnly: boolean,
    provider: string,
    fsPath: string,
    languageId?: string,
    nodeType?: string
): number {
    // set base latency based on provider and low performance languages or comments when available
    let baseline = provider === 'anthropic' ? 0 : defaultLatency.baseline

    const isLowPerformance = languageId && lowPerformanceLanguageIds.has(languageId)
    const isComment = nodeType === 'comment'
    if (!languageId || isLowPerformance || isComment) {
        baseline = defaultLatency.lowPerformance
    }

    // Do not add latency when feature flag for low performance languages only is enabled and the current language is not low performance
    if (lowPerformanceLanguagesOnly && !isLowPerformance) {
        return 0
    }

    const timestamp = Date.now()
    if (!userMetrics.sessionTimestamp) {
        userMetrics.sessionTimestamp = timestamp
    }

    const elapsed = timestamp - userMetrics.sessionTimestamp
    // reset metrics and timer after 5 minutes or file change
    if (elapsed >= 5 * 60 * 1000 || (userMetrics.fsPath && userMetrics.fsPath !== fsPath)) {
        resetLatency()
    }

    userMetrics.suggested++
    userMetrics.fsPath = fsPath

    const total = Math.max(baseline, Math.min(baseline + userMetrics.currentLatency, defaultLatency.max))

    // Increase latency linearly up to max after 5 rejected suggestions
    if (userMetrics.suggested >= 5 && userMetrics.currentLatency < defaultLatency.max) {
        userMetrics.currentLatency += defaultLatency.user
    }

    logDebug('CodyCompletionProvider:getLatency', `Latency Applied: ${total}`)

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
        fsPath: '',
    }
    logDebug('CodyCompletionProvider:resetLatency', 'Latency Reset')
}

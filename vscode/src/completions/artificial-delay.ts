import { logDebug } from '../log'
import type { CompletionIntent } from '../tree-sitter/queries'
export interface LatencyFeatureFlags {
    user?: boolean
}

const defaultLatencies = {
    user: 50,
    lowPerformance: 1000,
    max: 1400,
}

// Languages with lower performance get additional latency to avoid spamming users with unhelpful
// suggestions
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
    'twig',
    'jsonc',
    'handlebars',
])

const lowPerformanceCompletionIntents = new Set(['comment', 'import.source'])

let userMetrics = {
    sessionTimestamp: 0,
    currentLatency: 0,
    suggested: 0,
    uri: '',
}

/**
 * Calculates the artificial delay to be added to code completion suggestions based on various factors.
 *
 * The delay is calculated based on the following:
 * - A baseline delay for low-performance languages or completion intents
 * - The user's current latency, which increases linearly up to a maximum after 5 rejected suggestions
 * - The session timestamp, which is reset every 5 minutes or on file change
 *
 * The function returns the total delay to be added, which is capped at a maximum value.
 */
export function getArtificialDelay(params: {
    featureFlags: LatencyFeatureFlags
    uri: string
    languageId: string
    codyAutocompleteDisableLowPerfLangDelay: boolean
    completionIntent?: CompletionIntent
}): number {
    const { featureFlags, uri, languageId, codyAutocompleteDisableLowPerfLangDelay, completionIntent } =
        params

    let baseline = 0

    const isLowPerformanceLanguageId = lowPerformanceLanguageIds.has(languageId)
    const isLowPerformanceCompletionIntent =
        completionIntent && lowPerformanceCompletionIntents.has(completionIntent)
    // Add a baseline latency for low performance languages
    if (isLowPerformanceLanguageId || isLowPerformanceCompletionIntent) {
        // if user has disabled low performace language delay, then don't add latency
        if (!codyAutocompleteDisableLowPerfLangDelay) {
            baseline = defaultLatencies.lowPerformance
        }
    }

    const timestamp = Date.now()
    if (!userMetrics.sessionTimestamp) {
        userMetrics.sessionTimestamp = timestamp
    }

    const elapsed = timestamp - userMetrics.sessionTimestamp
    // reset metrics and timer after 5 minutes or file change
    if (elapsed >= 5 * 60 * 1000 || userMetrics.uri !== uri) {
        resetArtificialDelay(timestamp)
    }

    userMetrics.suggested++
    userMetrics.uri = uri

    const total = Math.max(
        baseline,
        Math.min(baseline + userMetrics.currentLatency, defaultLatencies.max)
    )

    // Increase latency linearly up to max after 5 rejected suggestions
    if (userMetrics.suggested >= 5 && userMetrics.currentLatency < defaultLatencies.max) {
        userMetrics.currentLatency += featureFlags.user ? defaultLatencies.user : 0
    }

    if (total > 0) {
        logDebug('AutocompleteProvider:getLatency', `Delay added: ${total}`)
    }

    return total
}

// reset user latency and counter:
// - on acceptance
// - every 5 minutes
// - on file change
export function resetArtificialDelay(timestamp = 0): void {
    userMetrics = {
        sessionTimestamp: timestamp,
        currentLatency: 0,
        suggested: 0,
        uri: '',
    }
}

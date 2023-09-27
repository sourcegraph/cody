import { logDebug } from '../log'

import { LastInlineCompletionCandidate } from './get-inline-completions'

const defaultLatency = {
    baseline: 600,
    user: 200,
    lowPerformance: 1200,
    max: 2000,
}

// Languages with lower performance get additional latency to avoid spamming users with unhelpful suggestions
const lowPerformanceLanguageIds = new Set(['css', 'html', 'scss', 'vue', 'dart', 'json', 'yaml', 'postcss'])

let currentUserLatency = 0
let lastSuggestionId: undefined | string

// Adjust the minimum latency based on user actions and env
export function getLatency(
    provider: string,
    lastCandidate: LastInlineCompletionCandidate | undefined,
    languageId?: string
): number {
    // Return early if we are still showing last suggestion
    if (lastSuggestionId && lastSuggestionId === lastCandidate?.result.logId) {
        return 0
    }

    lastSuggestionId = lastCandidate?.result.logId

    let baseline = provider === 'anthropic' ? 0 : defaultLatency.baseline
    let user = 0

    // set base latency based on provider and low performance languages
    if (languageId && lowPerformanceLanguageIds.has(languageId)) {
        baseline += defaultLatency.lowPerformance
    }

    if (!lastCandidate?.result.logId) {
        user = currentUserLatency ? currentUserLatency * 2 : defaultLatency.user
    }

    const total = Math.max(baseline, Math.min(baseline + user, defaultLatency.max))

    logDebug('CodyCompletionProvider:getLatency', `Applied Latency: ${total}`)

    return total
}

export function resetLatency(): void {
    currentUserLatency = 0
    lastSuggestionId = undefined
    logDebug('CodyCompletionProvider:resetLatency', 'User latency reset')
}

import { logDebug } from '../log'

import { LastInlineCompletionCandidate } from './get-inline-completions'

const baseline = 400 // ms
const lowPerformanceLatency = 1000 // ms
const userBaseline = 200 // ms
const maxLatency = 2000 // ms

// Languages with lower performance get additional latency to avoid spamming users with unhelpful suggestions
const lowPerformanceLanguageIds = new Set(['css', 'html', 'scss', 'vue', 'dart', 'json', 'yaml'])

export class LatencyManager {
    private baselineLatency = baseline
    private additionalLatencyBase = 0
    private userLatency = userBaseline

    /**
     * Holds the ID of the last suggestion to ensure we only adjust Latency on new suggestion.
     */
    private lastSuggestionId: string | undefined = undefined

    /**
     * Sets the starter latency baseline and additional latency based on provider and language.
     *
     * This sets the baseline latency to 0 for the 'anthropic' provider, otherwise the default baseline.
     * It also sets additional latency for low performance languages like CSS, HTML, etc.
     */
    private setBaselineLatency(provider: string, languageId?: string): void {
        this.baselineLatency = provider === 'anthropic' ? 0 : baseline
        this.additionalLatencyBase = lowPerformanceLanguageIds.has(languageId || '') ? lowPerformanceLatency : 0
    }

    /**
     * Gets the minimum latency to use for completions.
     * Used for throttling inline completions to avoid overloading the user with suggestions.
     */
    public getMinLatency(
        provider: string,
        lastCandidate: LastInlineCompletionCandidate | undefined,
        languageId?: string
    ): number | null {
        // Return early if last suggestion was the same
        if (this.lastSuggestionId && this.lastSuggestionId === lastCandidate?.result.logId) {
            return null
        }

        // Set baseline latency
        this.setBaselineLatency(provider, languageId)

        const latency = this.getUserLatency(lastCandidate)

        logDebug('CodyCompletionProvider:adustLatency', `Applied Latency: ${latency}`)

        return latency
    }

    /**
     * Gets the total latency by summing the baseline latency,
     * additional latency based on language, and user-specific latency.
     */
    private get totalLatency(): number {
        const total = this.baselineLatency + this.additionalLatencyBase + this.userLatency

        return Math.max(this.baselineLatency, Math.min(total, maxLatency))
    }

    /**
     * Adjusts the user-specific latency based on whether the last suggestion was accepted.
     *
     * If the last suggestion was accepted, reduces user latency by 100ms.
     * Otherwise increases the user latency by doubling the current amount.
     */
    private getUserLatency(lastCandidate: LastInlineCompletionCandidate | undefined): number {
        const lastSuggestionAccepted = !lastCandidate?.result.logId
        const adjustment = lastSuggestionAccepted ? -100 : Math.max(this.userLatency, userBaseline)

        this.userLatency += adjustment
        this.lastSuggestionId = lastCandidate?.result.logId

        return this.totalLatency
    }

    /**
     * Reset latency on accepted suggestion
     */
    public resetLatencyOnAccept(): void {
        this.additionalLatencyBase = 0
        this.userLatency = 0

        logDebug('CodyCompletionProvider:resetLatencyOnAccept', 'Latency Reset')
    }
}

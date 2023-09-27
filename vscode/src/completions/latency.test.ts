import { describe, expect, it } from 'vitest'

import { defaultLatency, getLatency, setLastSuggestionId } from './latency'

const mockLastSuggestionId = 'mock-suggestion-id'
const mockCurrentSuggestionId = 'mock-id'

describe('getLatency', () => {
    const lastSuggestionRejected = undefined
    const lastSuggestionAccepted = mockCurrentSuggestionId
    const lastSuggestionUnchanged = mockLastSuggestionId

    setLastSuggestionId(mockLastSuggestionId)

    it('returns default latency for user plus unsupported language at starting point on anthropic provider', () => {
        const provider = 'anthropic'
        const languageId = undefined

        const latency = getLatency(provider, undefined, languageId)
        expect(latency).toBe(defaultLatency.lowPerformance + defaultLatency.user)
    })

    it('returns unchanged latency on low performance language on same suggestion displayed on anthropic provider', () => {
        const provider = 'anthropic'
        const languageId = 'css'

        const latency = getLatency(provider, lastSuggestionUnchanged, languageId)
        expect(latency).toBe(defaultLatency.lowPerformance)
    })

    it('returns increased latency on low performance language after rejecting last suggestion on anthropic provider', () => {
        const provider = 'anthropic'
        const languageId = 'css'

        const latency = getLatency(provider, lastSuggestionRejected, languageId)
        expect(latency).toBe(defaultLatency.lowPerformance + defaultLatency.user)
    })

    it('returns reset latency on supported lang after accepting last suggestion on non-anthropic provider', () => {
        const provider = 'anthropic'
        const languageId = 'typescript'

        const latency = getLatency(provider, lastSuggestionAccepted, languageId)
        expect(latency).toBe(0)
    })

    it('returns baseline + user latency on support lang after rejecting last suggestion on non-anthropic provider', () => {
        const provider = 'non-anthropic'
        const languageId = 'typescript'

        const latency = getLatency(provider, lastSuggestionRejected, languageId)
        expect(latency).toBe(defaultLatency.baseline + defaultLatency.user)
    })

    it('returns default baseline + low perf lang + user latency after rejecting last candidate on non-anthropic provider', () => {
        const provider = 'non-anthropic'
        const languageId = 'css'

        const latency = getLatency(provider, lastSuggestionRejected, languageId)
        expect(latency).toBe(defaultLatency.baseline + defaultLatency.lowPerformance + defaultLatency.user)
    })
})

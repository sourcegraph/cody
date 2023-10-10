import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLatency, lowPerformanceLanguageIds, resetLatency } from './latency'

describe('getLatency', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.restoreAllMocks()
        resetLatency()
    })

    const featureFlags = {
        user: true,
        language: true,
        provider: true,
    }

    it('returns gradually increasing latency for anthropic provider when language is unsupported, up to max latency', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test'
        const languageId = undefined

        // start with default high latency for undefined languageId
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1400)
        // after the suggestion was accepted, user latency resets to 0, back to starting point
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        resetLatency()
        // next rejection doesn't change user latency until 5 rejected
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
    })

    it('returns gradually increasing latency up to max for CSS on anthropic provider when suggestions are rejected', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test.css'

        // css is a low performance language
        const languageId = 'css'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(true)

        // start with default high latency for low performance lang with default user latency added
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // start at default, but gradually increasing latency after 5 rejected suggestions
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1600)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1800)
        // max latency at 2000
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1600)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1800)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        // Latency will be reset after 5 minutes
        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
    })

    it('returns increasing latency after rejecting suggestions on anthropic provider', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test.ts'

        // Confirm typescript is not a low performance language
        const languageId = 'typescript'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(false)

        // start at default, but gradually increasing latency after 5 rejected suggestions
        expect(getLatency(featureFlags, provider, fileName, languageId, 'programe')).toBe(0)
        expect(getLatency(featureFlags, provider, fileName, languageId, '')).toBe(0)
        // baseline latency increased to 1000 due to comment node type
        expect(getLatency(featureFlags, provider, fileName, languageId, 'comment')).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(0)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(0)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(600)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(0)
    })

    it('returns default latency for CSS after accepting suggestion and resets after 5 minutes', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.css'

        // css is a low performance language
        const languageId = 'css'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(true)

        // start with default baseline latency for low performance lang
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // reset to starting point on every accepted suggestion
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        // Latency will be reset after 5 minutes
        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
    })

    it('returns increasing latency up to max after multiple rejections for supported language on non-anthropic provider', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'

        // Confirm typescript is not a low performance language
        const languageId = 'typescript'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(false)

        // start with default latency with provider based latency added
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(600)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(800)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1600)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1800)
        // max at 2000 after multiple rejections
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        // Writing a comment will not increase latency over max
        expect(getLatency(featureFlags, provider, fileName, languageId, 'comment')).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
    })

    it('returns increasing latency up to max after rejecting multiple suggestions, resets after file change and accept', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'

        // Confirm typescript is not a low performance language
        const languageId = 'typescript'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(false)

        // reject the first 5 suggestions, and confirm latency remains unchanged
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(400)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(600)
        // line is a comment, so latency should be increased where:
        // base is 1000 due to line is a comment, and user latency is 400 as this is the 7th rejection
        expect(getLatency(featureFlags, provider, fileName, languageId, 'comment')).toBe(1400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1200)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1400)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1600)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(1800)
        // max at 2000 after multiple rejections
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)
        expect(getLatency(featureFlags, provider, fileName, languageId)).toBe(2000)

        // reset latency on file change to default
        const newFileName = 'foo/test.ts'
        // latency should start increasing again after 5 rejections
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(400)
        // line is a comment, so latency should be increased
        expect(getLatency(featureFlags, provider, newFileName, languageId, 'comment')).toBe(1000)
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(400)
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(600)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(featureFlags, provider, newFileName, languageId)).toBe(400)
    })

    it('returns increased latency for user-based language only when only user flag is enabled', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'

        // css is a low performance language
        const languageId = 'css'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(true)

        const featureFlagsUserOnly = {
            user: true,
            language: false,
            provider: false,
        }

        // reject the first 5 suggestions, and confirm latency remains unchanged
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(0)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(0)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(0)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(0)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(0)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(200)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(600)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(800)
        expect(getLatency(featureFlagsUserOnly, provider, fileName, languageId)).toBe(1000)
    })

    it('returns default latency for low performance language only when only language flag is enabled', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'

        const featureFlagsLangOnly = {
            user: false,
            language: true,
            provider: false,
        }

        // css is a low performance language
        const lowPerformLanguageId = 'css'
        expect(lowPerformanceLanguageIds.has(lowPerformLanguageId)).toBe(true)

        // go is not a low performance language
        const languageId = 'go'
        expect(lowPerformanceLanguageIds.has(languageId)).toBe(false)

        // latency should only change based on language id when only the language flag is enabled
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        expect(getLatency(featureFlagsLangOnly, provider, fileName, lowPerformLanguageId)).toBe(1000)
        // latency back to 0 when language is no longer low-performance
        expect(getLatency(featureFlagsLangOnly, provider, fileName, languageId)).toBe(0)
    })

    it('returns default latency for non-anthropic provider only when only provider flag is enabled', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'
        const languageId = 'css'

        const featureFlagsProviderOnly = {
            user: false,
            language: false,
            provider: true,
        }

        // reject the first 5 suggestions
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
        // confirm latency remains the same for provider-based latency
        expect(getLatency(featureFlagsProviderOnly, provider, fileName, languageId)).toBe(400)
    })
})

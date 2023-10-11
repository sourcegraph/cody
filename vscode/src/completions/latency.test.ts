import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLatency, resetLatency } from './latency'

describe('getLatency', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.restoreAllMocks()
        resetLatency()
    })

    it('returns gradually increasing latency for anthropic provider when language is unsupported, up to max latency', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test'
        const languageId = undefined

        // start with default high latency for unsupported lang with default user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        resetLatency()
        // next rejection doesn't change user latency until 5 rejected
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
    })

    it('returns gradually increasing latency up to max for CSS on anthropic provider when suggestions are rejected', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test.css'
        const languageId = 'css'

        // start with default high latency for low performance lang with default user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // start at default, but gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        // max latency at 2000
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // Latency will be reset after 5 minutes
        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
    })

    it('returns increasing latency after rejecting suggestions on anthropic provider', () => {
        const provider = 'anthropic'
        const fileName = 'foo/bar/test.ts'
        const languageId = 'typescript'

        // start at default, but gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId, 'programe')).toBe(0)
        expect(getLatency(provider, fileName, languageId, '')).toBe(0)
        // baseline latency increased to 1000 due to comment node type
        expect(getLatency(provider, fileName, languageId, 'comment')).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(0)
        expect(getLatency(provider, fileName, languageId)).toBe(0)
        // gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(200)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(600)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(0)
    })

    it('returns default latency for CSS after accepting suggestion and resets after 5 minutes', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.css'
        const languageId = 'css'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // reset to starting point on every accepted suggestion
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        // Latency will be reset after 5 minutes
        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
    })

    it('returns increasing latency up to max after multiple rejections for supported language on non-anthropic provider', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'
        const languageId = 'typescript'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(provider, fileName, languageId)).toBe(600)
        expect(getLatency(provider, fileName, languageId)).toBe(800)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        // max at 2000 after multiple rejections
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // Writing a comment will not increase latency over max
        expect(getLatency(provider, fileName, languageId, 'comment')).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(400)
    })

    it('returns increasing latency up to max after rejecting multiple suggestions, resets after file change and accept', () => {
        const provider = 'non-anthropic'
        const fileName = 'foo/bar/test.ts'
        const languageId = 'typescript'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)

        expect(getLatency(provider, fileName, languageId)).toBe(600)
        // line is a comment, so latency should be increased where:
        // base is 1000 due to line is a comment, and user latency is 400 as this is the 7th rejection
        expect(getLatency(provider, fileName, languageId, 'comment')).toBe(1400)
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        expect(getLatency(provider, fileName, languageId)).toBe(1200)
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        // max at 2000 after multiple rejections
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)

        // reset latency on file change to default
        const newFileName = 'foo/test.ts'
        // latency should start increasing again after 5 rejections
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        // line is a comment, so latency should be increased
        expect(getLatency(provider, newFileName, languageId, 'comment')).toBe(1000)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        // Latency will not reset before 5 minutes
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(getLatency(provider, newFileName, languageId)).toBe(600)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
    })
})

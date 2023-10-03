import { afterEach, describe, expect, it } from 'vitest'

import { getLatency, resetLatency } from './latency'

describe('getLatency', () => {
    afterEach(() => {
        resetLatency()
    })

    it('returns gradually increasing latency for anthropic provider when language is unsupported', () => {
        const provider = 'anthropic'
        const languageId = undefined

        // start with default high latency for unsupported lang with default user latency added
        expect(getLatency(provider, languageId)).toBe(1000)
        // gradually increasing latency
        expect(getLatency(provider, languageId)).toBe(1200)
        expect(getLatency(provider, languageId)).toBe(1400)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1000)
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1200)
    })

    it('returns gradually increasing latency up to max for low performance language on anthropic provider when suggestions are rejected', () => {
        const provider = 'anthropic'
        const languageId = 'css'

        // start with default high latency for low performance lang with default user latency added
        expect(getLatency(provider, languageId)).toBe(1000)
        // gradually increasing latency
        expect(getLatency(provider, languageId)).toBe(1200)
        expect(getLatency(provider, languageId)).toBe(1400)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1000)
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1000)
        // gradually increasing latency again but max at 2000 after multiple rejections
        expect(getLatency(provider, languageId)).toBe(1200)
        expect(getLatency(provider, languageId)).toBe(1400)
        expect(getLatency(provider, languageId)).toBe(1800)
        expect(getLatency(provider, languageId)).toBe(2000)
        expect(getLatency(provider, languageId)).toBe(2000)
        expect(getLatency(provider, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1000)
    })

    it('returns increasing latency on anthropic provider after rejecting suggestions', () => {
        const provider = 'anthropic'
        const languageId = 'typescript'

        // gradually increasing latency
        expect(getLatency(provider, languageId)).toBe(0)
        expect(getLatency(provider, languageId)).toBe(200)
        expect(getLatency(provider, languageId)).toBe(400)
        expect(getLatency(provider, languageId)).toBe(800)
        // after the suggestion was accepted, user latency resets to 0, using baseline only
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(0)
    })

    it('returns default latency for CSS language on non-anthropic provider after accepting suggestion consistently', () => {
        const provider = 'non-anthropic'
        const languageId = 'css'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, languageId)).toBe(1400)
        // reset to starting point on every accepted suggestion
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, languageId)).toBe(1400)
    })

    it('returns increasing latency up to max latency for supported language on non-anthropic provider after rejecting multiple suggestions consistently', () => {
        const provider = 'non-anthropic'
        const languageId = 'typescript'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, languageId)).toBe(400)
        // latency should max at 2000 after multiple rejections
        expect(getLatency(provider, languageId)).toBe(600)
        expect(getLatency(provider, languageId)).toBe(800)
        expect(getLatency(provider, languageId)).toBe(1200)
        expect(getLatency(provider, languageId)).toBe(2000)
        expect(getLatency(provider, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        // back to starting latency after accepting a suggestion
        expect(getLatency(provider, languageId)).toBe(400)
    })
})

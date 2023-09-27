import { afterEach, describe, expect, it } from 'vitest'

import { getLatency, resetLatency } from './latency'

describe('getLatency', () => {
    afterEach(() => {
        resetLatency()
    })

    it('returns high latency for anthropic provider when language is unsupported', () => {
        const provider = 'anthropic'
        const languageId = undefined

        // start with default high latency with default user latency added
        expect(getLatency(provider, languageId)).toBe(1000)
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1200)
        // next one doubles the increased user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1400)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, languageId)).toBe(1000)
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1200)
    })

    it('returns gradually increasing latency up to max for low performance language on anthropic provider when suggestions are rejected', () => {
        const provider = 'anthropic'
        const languageId = 'css'

        // start with default high latency with default user latency added
        expect(getLatency(provider, languageId)).toBe(1000)
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1200)
        // next one doubles the increased user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1400)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, languageId)).toBe(1000)
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(1200)
        // latency should max at 2000 after multiple rejections
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

    it('returns increasing latency up to max for supported language on anthropic provider after rejecting suggestions', () => {
        const provider = 'anthropic'
        const languageId = 'typescript'

        // start with default latency with default user latency added
        expect(getLatency(provider, languageId)).toBe(0)
        // next one has doubled user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(200)
        // next one has unchanged user latency when last suggestion is still showing
        expect(getLatency(provider, languageId)).toBe(400)
        // next one has doubled user latency when last suggestion was not accepted
        expect(getLatency(provider, languageId)).toBe(800)
        // reset latency on accepted suggestion
        resetLatency()
        // back to starting point
        expect(getLatency(provider, languageId)).toBe(0)
    })

    it('returns decreasing latency for CSS language on non-anthropic provider after accepting suggestion', () => {
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

    it('returns increasing latency up to max for supported language on non-anthropic provider after rejecting multiple suggestions', () => {
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

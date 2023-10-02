import { afterEach, describe, expect, it } from 'vitest'

import { getLatency, resetLatency } from './latency'

describe('getLatency', () => {
    afterEach(() => {
        resetLatency()
    })

    it('returns gradually increasing latency for anthropic provider when language is unsupported', () => {
        const provider = 'anthropic'
        const fileName = 'test'
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

    it('returns gradually increasing latency up to max for low performance language on anthropic provider when suggestions are rejected', () => {
        const provider = 'anthropic'
        const fileName = 'test.css'
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
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        // after the suggestion was accepted, user latency resets to 0
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
        // reset latency on accepted suggestion
        resetLatency()
        // next one increases user latency when last suggestion was not accepted
        expect(getLatency(provider, fileName, languageId)).toBe(1000)
    })

    it('returns increasing latency on anthropic provider after rejecting suggestions', () => {
        const provider = 'anthropic'
        const fileName = 'test.ts'
        const languageId = 'typescript'

        // start at default, but gradually increasing latency after 5 rejected suggestions
        expect(getLatency(provider, fileName, languageId)).toBe(0)
        expect(getLatency(provider, fileName, languageId)).toBe(0)
        expect(getLatency(provider, fileName, languageId)).toBe(0)
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

    it('returns default latency for CSS language on non-anthropic provider after accepting suggestion consistently', () => {
        const provider = 'non-anthropic'
        const fileName = 'test.css'
        const languageId = 'css'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        // reset to starting point on every accepted suggestion
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(1400)
    })

    it('returns increasing latency up to max latency for supported language on non-anthropic provider after rejecting multiple suggestions consistently', () => {
        const provider = 'non-anthropic'
        const fileName = 'test.ts'
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
        expect(getLatency(provider, fileName, languageId)).toBe(1600)
        expect(getLatency(provider, fileName, languageId)).toBe(1800)
        // max at 2000 after multiple rejections
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        expect(getLatency(provider, fileName, languageId)).toBe(2000)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(provider, fileName, languageId)).toBe(400)
    })

    it('returns increasing latency up to max latency for supported language on non-anthropic provider after rejecting multiple suggestions consistently', () => {
        const provider = 'non-anthropic'
        const fileName = 'test.ts'
        const languageId = 'typescript'

        // start with default baseline latency with low performance and user latency added
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        // latency should start increasing after 5 rejections, but max at 2000
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)
        expect(getLatency(provider, fileName, languageId)).toBe(400)

        expect(getLatency(provider, fileName, languageId)).toBe(600)
        expect(getLatency(provider, fileName, languageId)).toBe(800)
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
        const newFileName = 'test2.ts'
        // latency should start increasing again after 5 rejections
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
        expect(getLatency(provider, newFileName, languageId)).toBe(400)

        expect(getLatency(provider, newFileName, languageId)).toBe(600)
        // reset latency on accepted suggestion
        resetLatency()
        expect(getLatency(provider, newFileName, languageId)).toBe(400)
    })
})

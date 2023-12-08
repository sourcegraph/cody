import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RateLimitError } from './errors'

describe('RateLimitError', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(2000, 1, 1, 13, 0, 0, 0))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const dayInSeconds = 60 * 60 * 24

    it('gives a short retryMessage within 7 days', () => {
        const error = new RateLimitError('autocompletions', 'rate limited oh no', false, 1234, String(5 * dayInSeconds))
        expect(error.retryMessage).toBe('Usage will reset Sunday at 1:00 PM')
    })

    it('gives a longer retryMessage if more than 7 days', () => {
        const error = new RateLimitError(
            'autocompletions',
            'rate limited oh no',
            false,
            1234,
            String(25 * dayInSeconds)
        )
        expect(error.retryMessage).toBe('Usage will reset in 25 days (02/26/2000 at 1:00 PM)')
    })
})

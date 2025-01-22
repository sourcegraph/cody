import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorage } from './../../services/LocalStorageProvider'
import { DeepCodyRateLimiter } from './DeepCodyRateLimiter'

describe('DeepCodyRateLimiter', () => {
    let rateLimiter: DeepCodyRateLimiter
    const NOW = new Date('2024-01-01T12:00:00Z')

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)

        // Initialize storage with 'inMemory' option
        localStorage.setStorage('inMemory')

        // Clear mock calls between tests
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('isAtLimit', () => {
        it('returns undefined when baseQuota is 0', () => {
            rateLimiter = new DeepCodyRateLimiter(0, 1)
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('allows usage when quota available', async () => {
            rateLimiter = new DeepCodyRateLimiter(6, 1)
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('correctly calculates quota replenishment', () => {
            rateLimiter = new DeepCodyRateLimiter(24, 1) // 24 tokens per day = 1 per hour
            const { quota, lastUsed } = localStorage.getDeepCodyUsage()
            expect(Math.ceil(quota!)).toBe(5)
            expect(lastUsed).toBe(NOW.toISOString())
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('respects multiplier in quota calculation', async () => {
            const { quota, lastUsed } = localStorage.getDeepCodyUsage()
            expect(Math.ceil(quota!)).toBe(4)
            expect(lastUsed).toBe(NOW.toISOString())
            rateLimiter = new DeepCodyRateLimiter(10, 2) // 20 tokens per day
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('resets quota after 24 hours of non-use', async () => {
            const { quota, lastUsed } = localStorage.getDeepCodyUsage()
            expect(Math.ceil(quota!)).toBe(3)
            expect(lastUsed).toBe(NOW.toISOString())
            rateLimiter = new DeepCodyRateLimiter(3, 1)
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('blocks usage when no quota available', async () => {
            rateLimiter = new DeepCodyRateLimiter(1, 1)
            const ONE_DAY_MS = 24 * 60 * 60 * 1000
            const ONE_HOUR_MS = ONE_DAY_MS / 24
            expect(rateLimiter.isAtLimit()).toBeUndefined()
            // It should be 24 hours after last used time (which is current)
            expect(Number(rateLimiter.isAtLimit())).toBe(ONE_HOUR_MS * 24)
            // Fake an hour has passed.
            vi.advanceTimersByTime(ONE_HOUR_MS)
            // Check if the time to wait has decreased by an hour.
            expect(Number(rateLimiter.isAtLimit())).toBe(ONE_HOUR_MS * 23)
        })
    })

    describe('isAtLimit with lastUsedCache', () => {
        it('returns consistent wait time between calls when at limit', () => {
            rateLimiter = new DeepCodyRateLimiter(1, 1)
            const ONE_DAY_MS = 24 * 60 * 60 * 1000

            // First call hits the limit
            expect(rateLimiter.isAtLimit()).toBeUndefined()
            const initialWaitTime = rateLimiter.isAtLimit()
            expect(initialWaitTime).toBe(ONE_DAY_MS / 1000)

            // Second call should return same wait time
            expect(rateLimiter.isAtLimit()).toBe(initialWaitTime)

            // Advance time by 1 hour
            const ONE_HOUR_MS = ONE_DAY_MS / 24
            vi.advanceTimersByTime(ONE_HOUR_MS)

            // Wait time should decrease by 1 hour
            expect(rateLimiter.isAtLimit()).toBe((ONE_DAY_MS - ONE_HOUR_MS) / 1000)
        })

        it('resets cache after wait period expires', () => {
            rateLimiter = new DeepCodyRateLimiter(1, 1)

            // Hit the limit
            expect(rateLimiter.isAtLimit()).toBeUndefined()
            expect(rateLimiter.isAtLimit()).toBeDefined()

            // Advance time past 24 hours
            vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000)

            // Should allow usage again
            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })
    })

    describe('getRateLimitError', () => {
        it('returns correct RateLimitError object', () => {
            rateLimiter = new DeepCodyRateLimiter()
            const error = rateLimiter.getRateLimitError(300)

            expect(error.name).toBe('RateLimitError')
            expect(error.feature).toBe('Agentic Chat')
            expect(error.retryAfter).toBe('300')
        })
    })
})

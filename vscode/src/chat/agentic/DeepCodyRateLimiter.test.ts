import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorage } from './../../services/LocalStorageProvider'
import { DeepCodyRateLimiter } from './DeepCodyRateLimiter'

// Create a mock type for localStorage
vi.mock('./../../services/LocalStorageProvider', () => ({
    localStorage: {
        getDeepCodyUsage: vi.fn(),
        setDeepCodyUsage: vi.fn(),
        setStorage: vi.fn(),
    },
}))

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

        it('allows usage when quota available', () => {
            rateLimiter = new DeepCodyRateLimiter(10, 1)

            // Set up mock return value
            const mockUsage = {
                quota: 5,
                lastUsed: new Date(NOW.getTime() - 3600000), // 1 hour ago
            }
            vi.spyOn(localStorage, 'getDeepCodyUsage').mockImplementation(() => mockUsage)

            expect(rateLimiter.isAtLimit()).toBeUndefined()
            expect(localStorage.setDeepCodyUsage).toHaveBeenCalled()
        })

        it('blocks usage when no quota available', () => {
            rateLimiter = new DeepCodyRateLimiter(10, 1)

            const mockUsage = {
                quota: 0,
                lastUsed: new Date(NOW.getTime() - 3600000),
            }
            vi.spyOn(localStorage, 'getDeepCodyUsage').mockImplementation(() => mockUsage)

            const result = rateLimiter.isAtLimit()
            expect(result).toBeDefined()
            expect(Number(result)).toBeGreaterThan(0)
        })

        it('correctly calculates quota replenishment', () => {
            rateLimiter = new DeepCodyRateLimiter(24, 1) // 24 tokens per day = 1 per hour

            const mockUsage = {
                quota: 0,
                lastUsed: new Date(NOW.getTime() - 3600000),
            }
            vi.spyOn(localStorage, 'getDeepCodyUsage').mockImplementation(() => mockUsage)

            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('respects multiplier in quota calculation', () => {
            rateLimiter = new DeepCodyRateLimiter(10, 2) // 20 tokens per day

            const mockUsage = {
                quota: 0,
                lastUsed: new Date(NOW.getTime() - 43200000), // 12 hours ago
            }
            vi.spyOn(localStorage, 'getDeepCodyUsage').mockImplementation(() => mockUsage)

            expect(rateLimiter.isAtLimit()).toBeUndefined()
        })

        it('resets quota after 24 hours of non-use', () => {
            rateLimiter = new DeepCodyRateLimiter(50, 1)
            const mockUsage = {
                quota: 0, // Empty quota
                lastUsed: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), // 25 hours ago
            }
            vi.spyOn(localStorage, 'getDeepCodyUsage').mockImplementation(() => mockUsage)

            expect(rateLimiter.isAtLimit()).toBeUndefined()
            expect(localStorage.setDeepCodyUsage).toHaveBeenCalledWith(50, NOW.toISOString())
        })
    })

    describe('getRateLimitError', () => {
        it('returns correct RateLimitError object', () => {
            rateLimiter = new DeepCodyRateLimiter()
            const error = rateLimiter.getRateLimitError('300')

            expect(error.name).toBe('RateLimitError')
            expect(error.feature).toBe('Deep Cody')
            expect(error.retryAfter).toBe('300')
        })
    })
})

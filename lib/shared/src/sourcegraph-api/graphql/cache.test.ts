import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AbortError } from '../errors'
import { AbortAggregator, GraphQLResultCache } from './cache'

describe('AbortAggregator', () => {
    test('aborts when all enrolled signals are aborted', () => {
        const aggregator = new AbortAggregator()
        const controller1 = new AbortController()
        const controller2 = new AbortController()

        // Consider two concurrent fetch signals.
        aggregator.enrol(controller1.signal)
        aggregator.enrol(controller2.signal)

        // Aborting one signal shouldn't abort the fetch
        controller1.abort()
        expect(aggregator.signal.aborted).toBe(false)

        // Aborting all signals should abort the fetch
        controller2.abort()
        expect(aggregator.signal.aborted).toBe(true)
    })
})

describe('Cache abort behavior', () => {
    test('invalidate aborts in-progress fetches', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 200,
            initialRetryDelayMsec: 1,
            backoffFactor: 2,
        })

        let fetchCount = 0
        const fetcher = (signal: AbortSignal) => {
            fetchCount++
            return new Promise((resolve, reject) =>
                setTimeout(() => {
                    if (signal.aborted) {
                        reject(new AbortError('aborted'))
                    } else {
                        resolve({ data: 'test' })
                    }
                }, 10)
            )
        }

        const controller = new AbortController()
        const promise = cache.get(controller.signal, fetcher)
        cache.invalidate()
        expect(fetchCount).toBe(1) // Call happened immediately
        // This depends on the fetch implementation using the abort signal...
        await expect(promise).rejects.toThrow('aborted')
    })

    test('fetching is aborted if all request abort', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 200,
            initialRetryDelayMsec: 1,
            backoffFactor: 2,
        })

        let fetchCount = 0
        const fetcher = (signal: AbortSignal) => {
            fetchCount++
            return new Promise((resolve, reject) =>
                setTimeout(() => {
                    if (signal.aborted) {
                        reject(new AbortError('aborted'))
                    } else {
                        resolve({ data: 'test' })
                    }
                }, 10)
            )
        }

        const controller1 = new AbortController()
        const controller2 = new AbortController()

        const promise1 = cache.get(controller1.signal, fetcher)
        const promise2 = cache.get(controller2.signal, fetcher)
        expect(fetchCount).toBe(1)

        controller1.abort()
        controller2.abort()

        await expect(promise1).rejects.toThrow('aborted')
        await expect(promise2).rejects.toThrow('aborted')
    })

    test('fetching continues unless all fetchers abort', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 200,
            initialRetryDelayMsec: 1,
            backoffFactor: 2,
        })

        let fetchCount = 0
        const fetcher = (signal: AbortSignal) => {
            fetchCount++
            return new Promise((resolve, reject) =>
                setTimeout(() => {
                    if (signal.aborted) {
                        reject(new AbortError('aborted'))
                    } else {
                        resolve({ data: 'test' })
                    }
                }, 10)
            )
        }

        const controller1 = new AbortController()
        const controller2 = new AbortController()

        const promise1 = cache.get(controller1.signal, fetcher)
        const promise2 = cache.get(controller2.signal, fetcher)
        expect(fetchCount).toBe(1)
        expect(promise1).toStrictEqual(promise2)

        controller1.abort()
        // Note: Controller 2 is not aborted.

        // Note: "Both" fetches (they are de-duped) succeed despite controller1
        // aborting.
        await expect(promise1).resolves.toEqual({ data: 'test' })
    })
})

describe('GraphQLResultCache', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    test('uses exponential backoff for errors', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 60000,
            initialRetryDelayMsec: 1000,
            backoffFactor: 2,
        })

        let fetchCount = 0
        const fetcher = () => {
            fetchCount++
            return Promise.resolve(new Error('test error'))
        }

        // First fetch
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(1)

        // Should retry after 1000ms (initial delay)
        await vi.advanceTimersByTimeAsync(990)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(1) // Still cached

        await vi.advanceTimersByTimeAsync(10)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(2) // Retried

        // Should retry after 2000ms (2x backoff)
        await vi.advanceTimersByTimeAsync(1990)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(2) // Still cached

        await vi.advanceTimersByTimeAsync(10)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(3) // Retried

        // Should retry after 4000ms (4x backoff)
        await vi.advanceTimersByTimeAsync(3990)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(3) // Still cached

        await vi.advanceTimersByTimeAsync(10)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(4) // Retried
    })

    test('successful results are cached for full duration', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 5000,
            initialRetryDelayMsec: 1000,
            backoffFactor: 2,
        })

        let fetchCount = 0
        const fetcher = () => {
            fetchCount++
            return Promise.resolve({ data: 'success' })
        }

        // First fetch
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(1)

        // Should still be cached before maxAge
        await vi.advanceTimersByTimeAsync(4999)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(1)

        // Should fetch again after maxAge
        await vi.advanceTimersByTimeAsync(1)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(2)
    })

    test('switches from error to success resets retry count', async () => {
        const cache = new GraphQLResultCache({
            queryName: 'test',
            maxAgeMsec: 5000,
            initialRetryDelayMsec: 1000,
            backoffFactor: 2,
        })

        let shouldError = true
        let fetchCount = 0
        const fetcher = () => {
            fetchCount++
            return Promise.resolve(shouldError ? new Error('test error') : { data: 'success' })
        }

        // First fetch (error)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(1)

        // Wait for initial retry delay
        await vi.advanceTimersByTimeAsync(1000)
        shouldError = false
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(2)

        // Should now use full cache duration
        await vi.advanceTimersByTimeAsync(4999)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(2)

        await vi.advanceTimersByTimeAsync(1)
        await cache.get(undefined, fetcher)
        expect(fetchCount).toBe(3)
    })
})

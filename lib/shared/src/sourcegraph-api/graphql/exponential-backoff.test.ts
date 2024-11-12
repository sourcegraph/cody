import { Observable, unsubscribe } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observableOfTimedSequence, switchMap } from '../../misc/observable'
import {
    type ExponentialBackoffRetryOptions,
    ExponentialBackoffTimer,
    exponentialBackoffRetry,
} from './exponential-backoff'

describe('ExponentialBackoffTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    class TestTimer extends ExponentialBackoffTimer {
        public runCount = 0
        protected run(successCount: number, retryCount: number): void {
            this.runCount++
        }
    }

    const defaultOptions: ExponentialBackoffRetryOptions = {
        label: 'test',
        maxRetries: 3,
        initialDelayMsec: 1000,
        backoffFactor: 2,
    }

    it('should handle successful operations', () => {
        const timer = new TestTimer(defaultOptions)
        timer.success()
        expect(timer.runCount).toBe(0)
    })

    it('should retry on failure with exponential backoff', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        expect(timer.runCount).toBe(0)

        // First retry (1000ms)
        vi.advanceTimersByTime(1000)
        expect(timer.runCount).toBe(1)

        timer.failure(error)
        // Second retry (2000ms)
        vi.advanceTimersByTime(2000)
        expect(timer.runCount).toBe(2)

        timer.failure(error)
        // Third retry (4000ms)
        vi.advanceTimersByTime(4000)
        expect(timer.runCount).toBe(3)
    })

    it('should throw error after max retries', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        vi.advanceTimersByTime(1000)
        timer.failure(error)
        vi.advanceTimersByTime(2000)
        timer.failure(error)
        vi.advanceTimersByTime(4000)

        expect(() => timer.failure(error)).toThrow(error)
    })

    it('should clear pending retry on success', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        timer.success()
        vi.advanceTimersByTime(1000)
        expect(timer.runCount).toBe(0)
    })

    it('should not schedule multiple retries for the same failure', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        timer.failure(error)
        vi.advanceTimersByTime(4000)
        expect(timer.runCount).toBe(1)
    })

    it('should cleanup timer on dispose', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        timer[Symbol.dispose]()
        vi.advanceTimersByTime(1000)
        expect(timer.runCount).toBe(0)
    })
})

describe('exponentialBackoffRetry', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should emit initial value immediately', async () => {
        const options = {
            label: 'test',
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ retryCount: number }> = []

        const subscription = exponentialBackoffRetry(options).subscribe(({ retryCount }) => {
            values.push({ retryCount })
        })

        await vi.runAllTimersAsync()
        expect(values).toEqual([{ retryCount: 0 }])
        unsubscribe(subscription)
    })

    it('should emit values with exponential backoff delays', async () => {
        const options = {
            label: 'test',
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ retryCount: number }> = []

        const subscription = exponentialBackoffRetry(options).subscribe(({ retry, retryCount }) => {
            values.push({ retryCount })
            const error = new Error('test error')
            try {
                retry.failure(error)
                expect(retryCount).toBeLessThan(3)
            } catch (thrownError) {
                expect(retryCount).toBe(3)
                expect(thrownError).toBe(error)
            }
        })

        await vi.advanceTimersByTimeAsync(0)
        expect(values).toEqual([{ retryCount: 0 }])
        await vi.advanceTimersByTimeAsync(1000)
        expect(values).toEqual([{ retryCount: 0 }, { retryCount: 1 }])
        await vi.advanceTimersByTimeAsync(1999)
        expect(values.length).toBe(2)
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toEqual([{ retryCount: 0 }, { retryCount: 1 }, { retryCount: 2 }])
        await vi.advanceTimersByTimeAsync(4000)
        expect(values).toEqual([
            { retryCount: 0 },
            { retryCount: 1 },
            { retryCount: 2 },
            { retryCount: 3 },
        ])
        unsubscribe(subscription)
    })

    it('should stop retrying after success', async () => {
        const options = {
            label: 'test',
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ retryCount: number }> = []

        const subscription = exponentialBackoffRetry(options).subscribe(({ retry, retryCount }) => {
            values.push({ retryCount })
            if (retryCount === 2) {
                retry.success()
            } else {
                expect(retryCount).toBeLessThan(2)
                retry.failure(new Error('test error'))
            }
        })

        await vi.runAllTimersAsync()
        expect(values).toEqual([{ retryCount: 0 }, { retryCount: 1 }, { retryCount: 2 }])
        unsubscribe(subscription)
    })

    it('should be able to be combined with an input to a downstream map', async () => {
        const options = {
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ flavor: string; noms: number }> = []

        // We periodically get a flavor of pie we should try.
        const pies = observableOfTimedSequence<string>(
            'cherry',
            3000,
            'apple',
            8000,
            'pumpkin',
            4000,
            'pecan'
        ).pipe(
            // We will try the pies with an exponential backoff.
            switchMap(flavor =>
                exponentialBackoffRetry({ label: flavor, ...options }).map(retry => ({ flavor, retry }))
            )
        )
        // We like anything we have tried three times.
        const likedPies: string[] = []
        const subscription = new Observable<string>(observer => {
            const tasteTest = pies.subscribe(({ flavor, retry: taste }) => {
                values.push({ flavor, noms: taste.retryCount })
                if (taste.retryCount === 3) {
                    taste.retry.success()
                    observer.next(flavor)
                } else {
                    taste.retry.failure(new Error('yuck'))
                }
            })
            return () => {
                tasteTest.unsubscribe()
            }
        }).subscribe(flavor => likedPies.push(flavor))

        await vi.runAllTimersAsync()
        expect(values).toEqual([
            { flavor: 'cherry', noms: 0 },
            { flavor: 'cherry', noms: 1 },
            { flavor: 'apple', noms: 0 },
            { flavor: 'apple', noms: 1 },
            { flavor: 'apple', noms: 2 },
            { flavor: 'apple', noms: 3 },
            { flavor: 'pumpkin', noms: 0 },
            { flavor: 'pumpkin', noms: 1 },
            { flavor: 'pumpkin', noms: 2 },
            { flavor: 'pecan', noms: 0 },
            { flavor: 'pecan', noms: 1 },
            { flavor: 'pecan', noms: 2 },
            { flavor: 'pecan', noms: 3 },
        ])
        expect(likedPies).toEqual(['apple', 'pecan'])

        unsubscribe(subscription)
    })
})

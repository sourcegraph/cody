import { Observable, unsubscribe } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combineLatest } from '../../misc/observable'
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

    it('should reset retry count on success', () => {
        const timer = new TestTimer(defaultOptions)
        const error = new Error('test error')

        timer.failure(error)
        vi.advanceTimersByTime(1000)
        timer.success()
        timer.failure(error)
        vi.advanceTimersByTime(1000)
        expect(timer.runCount).toBe(2)
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
        const values: Array<{ iteration: number; retryCount: number }> = []

        const subscription = Observable.of('constant')
            .pipe(exponentialBackoffRetry(options))
            .subscribe(({ iteration, retryCount }) => {
                values.push({ iteration, retryCount })
            })

        await vi.runAllTimersAsync()
        expect(values).toEqual([{ iteration: 0, retryCount: 0 }])
        unsubscribe(subscription)
    })
    /*
    it('should emit values with exponential backoff delays', async () => {
        const options = {
            label: 'test',
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ iteration: number; retryCount: number }> = []

        const subscription = exponentialBackoffRetry(options).subscribe(
            ({ retry, iteration, retryCount }) => {
                values.push({ iteration, retryCount })
                const error = new Error('test error')
                try {
                    retry.failure(error)
                    expect(retryCount).toBeLessThan(3)
                } catch (thrownError) {
                    expect(retryCount).toBe(3)
                    expect(thrownError).toBe(error)
                }
            }
        )

        await vi.advanceTimersByTimeAsync(0)
        expect(values).toEqual([{ iteration: 0, retryCount: 0 }])
        await vi.advanceTimersByTimeAsync(1000)
        expect(values).toEqual([
            { iteration: 0, retryCount: 0 },
            { iteration: 0, retryCount: 1 },
        ])
        await vi.advanceTimersByTimeAsync(1999)
        expect(values.length).toBe(2)
        await vi.advanceTimersByTimeAsync(1)
        expect(values).toEqual([
            { iteration: 0, retryCount: 0 },
            { iteration: 0, retryCount: 1 },
            { iteration: 0, retryCount: 2 },
        ])
        await vi.advanceTimersByTimeAsync(4000)
        expect(values).toEqual([
            { iteration: 0, retryCount: 0 },
            { iteration: 0, retryCount: 1 },
            { iteration: 0, retryCount: 2 },
            { iteration: 0, retryCount: 3 },
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
        const values: Array<{ iteration: number; retryCount: number }> = []

        const subscription = exponentialBackoffRetry(options).subscribe(
            ({ retry, iteration, retryCount }) => {
                values.push({ iteration, retryCount })
                if (retryCount === 2) {
                    retry.success()
                } else {
                    expect(retryCount).toBeLessThan(2)
                    retry.failure(new Error('test error'))
                }
            }
        )

        await vi.runAllTimersAsync()
        expect(values).toEqual([
            { iteration: 0, retryCount: 0 },
            { iteration: 0, retryCount: 1 },
            { iteration: 0, retryCount: 2 },
        ])
        unsubscribe(subscription)
    })

    /*
    it('should stop reset the retry count after success', async () => {
        const options = {
            label: 'test',
            maxRetries: 3,
            initialDelayMsec: 1000,
            backoffFactor: 2,
        }
        const values: Array<{ flavor: string; iteration: number; retryCount: number }> = []

        const tries = exponentialBackoffRetry(options)
        const pies = Observable.of(['apple', 'cherry', 'pumpkin', 'key lime'])
        const subscription = combineLatest(pies, tries).subscribe(
            ([flavor, { retry, iteration, retryCount }]) => {
                values.push({ flavor, iteration, retryCount })
                if (
                    iteration === 0 ||
                    (iteration === 1 && retryCount === 2) ||
                    iteration === 2 ||
                    iteration === 3 ||
                    (iteration === 4 && retryCount === 4)
                ) {
                    retry.success()
                } else {
                    retry.failure(new Error('test error'))
                }
            }
        )

        expect(values).toEqual([
            { iteration: 0, retryCount: 0 },
            { iteration: 0, retryCount: 1 },
            { iteration: 0, retryCount: 2 },
        ])
        unsubscribe(subscription)
    })
        */
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbortError, TimeoutError } from '@sourcegraph/cody-shared'

import { type Limiter, createLimiter } from './limiter'

describe('limiter', () => {
    it('should limit the execution of promises', async () => {
        const limiter = createLimiter({ limit: 2, timeout: 100 })

        const req1 = createMockRequest(limiter)
        const req2 = createMockRequest(limiter)
        const req3 = createMockRequest(limiter)

        expect(req1.hasStarted()).toBe(true)
        expect(req2.hasStarted()).toBe(true)
        expect(req3.hasStarted()).toBe(false)

        req1.resolve('foo')
        req2.resolve('bar')
        await expect(req1.promise).resolves.toBe('foo')
        await expect(req2.promise).resolves.toBe('bar')

        expect(req3.hasStarted()).toBe(true)

        req3.resolve('baz')
        await expect(req3.promise).resolves.toBe('baz')
    })

    it('should abort pending promises', async () => {
        const limiter = createLimiter({ limit: 1, timeout: 100 })

        const req1 = createMockRequest(limiter)
        const req2 = createMockRequest(limiter)

        expect(req1.hasStarted()).toBe(true)
        expect(req2.hasStarted()).toBe(false)

        req1.abort()
        req2.abort()

        req1.resolve('foo')

        await expect(req1.promise).resolves.toBe('foo')
        await expect(req2.promise).rejects.toBeInstanceOf(AbortError)
    })

    describe('with fake timers', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })
        afterEach(() => {
            vi.useRealTimers()
        })

        it('should time out a request if it takes too long', async () => {
            const limiter = createLimiter({ limit: 1, timeout: 100 })

            const req1 = createMockRequest(limiter)
            const req2 = createMockRequest(limiter)

            expect(req1.hasStarted()).toBe(true)
            expect(req2.hasStarted()).toBe(false)

            vi.advanceTimersByTime(100)

            await expect(req1.promise).rejects.toBeInstanceOf(TimeoutError)
            expect(req2.hasStarted()).toBe(true)

            req2.resolve('foo')
            await expect(req2.promise).resolves.toBe('foo')
        })
    })
})

function createMockRequest<T>(limiter: Limiter): {
    resolve: (val: T) => void
    hasStarted: () => boolean
    abort: () => void
    promise: Promise<T>
} {
    const abortController = new AbortController()
    let resolve: ((val: T) => void) | null
    const promise = limiter<T>(
        async () =>
            new Promise(_resolve => {
                resolve = _resolve
            }),
        abortController.signal
    )

    return {
        resolve(val: T) {
            if (!resolve) {
                throw new Error('Promises not started yet')
            }
            resolve(val)
        },
        hasStarted() {
            return !!resolve
        },
        abort() {
            abortController.abort()
        },
        promise,
    }
}

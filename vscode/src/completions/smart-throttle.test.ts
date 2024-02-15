import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SmartThrottleService } from './smart-throttle'
import type { RequestParams } from './request-manager'

describe('SmartThrottleService', () => {
    let service: SmartThrottleService

    beforeEach(() => {
        vi.useFakeTimers()
        service = new SmartThrottleService()
    })

    it('keeps one start-of-line requests and immediately starts it', async () => {
        const throttled = await service.throttle(createRequest(''))
        // Request is returned immediately
        expect(throttled?.abortSignal?.aborted).toBe(false)

        vi.advanceTimersByTime(100)

        const newThrottled = await service.throttle(createRequest('\t'))
        // Request is returned immediately
        expect(newThrottled?.abortSignal?.aborted).toBe(false)
        // Previous start-of-line request was cancelled
        expect(throttled?.abortSignal?.aborted).toBe(true)

        vi.advanceTimersByTime(100)

        // Enqueuing a non start-of-line-request does not cancel the last start-of-line
        const promise = service.throttle(createRequest('\tfoo'))
        vi.advanceTimersByTime(25)
        expect(newThrottled?.abortSignal?.aborted).toBe(false)
        expect(promise).resolves.toMatchObject({ docContext: { currentLinePrefix: '\tfoo' } })
    })

    it('promotes tail request after timeout', async () => {
        const firstPromise = service.throttle(createRequest('f'))
        vi.advanceTimersByTime(25)
        const firstThrottledRequest = await firstPromise

        const secondPromise = service.throttle(createRequest('fo'))
        vi.advanceTimersByTime(25)
        const secondThrottledRequest = await secondPromise

        // The first promise is promoted so it will not be cancelled and coexist with the
        // tail request
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)

        // Enqueuing a third request will cancel the second one
        const thirdPromise = service.throttle(createRequest('foo'))
        vi.advanceTimersByTime(25)
        const thirdThrottledRequest = await thirdPromise

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)

        // The third request will be promoted if enough time passes since the last promotion
        vi.advanceTimersByTime(200)

        const fourthPromise = service.throttle(createRequest('foo'))
        vi.advanceTimersByTime(25)
        const fourthThrottledRequest = await fourthPromise

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(fourthThrottledRequest?.abortSignal?.aborted).toBe(false)
    })

    it('cancels tail requests during the debounce timeout', async () => {
        const abortController = new AbortController()
        const firstPromise = service.throttle(createRequest('foo', abortController))
        abortController.abort()
        vi.advanceTimersByTime(25)
        expect(await firstPromise).toBeNull()
    })
})

function createRequest(
    currentLinePrefix: string,
    abortController = new AbortController()
): RequestParams {
    return {
        docContext: {
            currentLinePrefix,
        } as any,
        abortSignal: abortController.signal,
    } as RequestParams
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentDocContext } from './get-current-doc-context'
import { TriggerKind } from './get-inline-completions'
import type { RequestParams } from './request-manager'
import { SmartThrottleService, THROTTLE_TIMEOUT } from './smart-throttle'
import { documentAndPosition } from './test-helpers'

const stale = () => {
    let stale = false

    return {
        set() {
            stale = true
        },
        get() {
            return stale
        },
    }
}

describe('SmartThrottleService', () => {
    let service: SmartThrottleService

    beforeEach(() => {
        vi.useFakeTimers()
        service = new SmartThrottleService()
    })

    it('keeps one start-of-line request per line and immediately starts it', async () => {
        const firstStaleMock = stale()
        const firstThrottledRequest = await service.throttle(
            createRequest('█'),
            TriggerKind.Automatic,
            firstStaleMock.set
        )
        // Request is returned immediately
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(firstStaleMock.get()).toBe(false)

        vi.advanceTimersByTime(100)

        const secondStaleMock = stale()
        const secondThrottledRequest = await service.throttle(
            createRequest('\n█'),
            TriggerKind.Automatic,
            secondStaleMock.set
        )
        // Request is returned immediately
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondStaleMock.get()).toBe(false)
        // Previous start-of-line request was cancelled
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(true)

        // Another request on the same line will not be treated as a start-of-line request
        const thirdStaleMock = stale()
        const thirdThrottledRequest = await service.throttle(
            createRequest('\n\t█'),
            TriggerKind.Manual,
            thirdStaleMock.set
        )
        // Request is returned immediately
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(thirdStaleMock.get()).toBe(false)
        // Previous start-of-line request is still running
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondStaleMock.get()).toBe(false)

        vi.advanceTimersByTime(100)

        // Enqueuing a non start-of-line-request does not cancel the last start-of-line
        const fourthThrottledRequest = service.throttle(
            createRequest('\tfoo█'),
            TriggerKind.Manual,
            stale
        )
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondStaleMock.get()).toBe(false)
        expect(fourthThrottledRequest).resolves.toMatchObject({
            docContext: { currentLinePrefix: '\tfoo' },
        })
    })

    it('promotes tail request after timeout', async () => {
        const firstStaleMock = stale()
        const firstThrottledRequest = await service.throttle(
            createRequest('f█'),
            TriggerKind.Manual,
            firstStaleMock.set
        )
        const secondStaleMock = stale()
        const secondThrottledRequest = await service.throttle(
            createRequest('fo█'),
            TriggerKind.Manual,
            secondStaleMock.set
        )

        // The first promise is promoted so it will not be cancelled and coexist with the
        // tail request. It is marked as stale.
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(firstStaleMock.get()).toBe(true)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondStaleMock.get()).toBe(false)

        // Enqueuing a third request will cancel the second one
        const thirdStaleMock = stale()
        const thirdThrottledRequest = await service.throttle(
            createRequest('foo█'),
            TriggerKind.Manual,
            thirdStaleMock.set
        )

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)

        // The third request will be promoted if enough time passes since the last promotion
        // It will also be marked as stale.
        vi.advanceTimersByTime(THROTTLE_TIMEOUT + 10)

        const fourthStaleMock = stale()
        const fourthThrottledRequest = await service.throttle(
            createRequest('foo█'),
            TriggerKind.Manual,
            fourthStaleMock.set
        )

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(thirdStaleMock.get()).toBe(true)
        expect(fourthThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(fourthStaleMock.get()).toBe(false)
    })

    it('cancels tail requests during the debounce timeout for automatic triggers', async () => {
        const abortController = new AbortController()
        const firstPromise = service.throttle(
            createRequest('foo█', abortController),
            TriggerKind.Automatic,
            stale().set
        )
        abortController.abort()
        vi.advanceTimersByTime(25)
        expect(await firstPromise).toBeNull()
    })
})

function createRequest(textWithCursor: string, abortController = new AbortController()): RequestParams {
    const { document, position } = documentAndPosition(textWithCursor)
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        context: undefined,
    })
    return {
        docContext,
        document,
        position,
        abortSignal: abortController.signal,
    } as RequestParams
}

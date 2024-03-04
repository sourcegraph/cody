import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentDocContext } from './get-current-doc-context'
import { TriggerKind } from './get-inline-completions'
import type { RequestParams } from './request-manager'
import { SmartThrottleService, THROTTLE_TIMEOUT } from './smart-throttle'
import { documentAndPosition } from './test-helpers'

describe('SmartThrottleService', () => {
    let service: SmartThrottleService

    beforeEach(() => {
        vi.useFakeTimers()
        service = new SmartThrottleService()
    })

    it('keeps one start-of-line request per line and immediately starts it', async () => {
        const firstThrottledRequest = await service.throttle(createRequest('█'), TriggerKind.Automatic)
        // Request is returned immediately
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)

        vi.advanceTimersByTime(100)

        const secondThrottledRequest = await service.throttle(
            createRequest('\n█'),
            TriggerKind.Automatic
        )
        // Request is returned immediately
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        // Previous start-of-line request was cancelled
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(true)

        // Another request on the same line will not be treated as a start-of-line request
        const thirdThrottledRequest = await service.throttle(createRequest('\n\t█'), TriggerKind.Manual)
        // Request is returned immediately
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)
        // Previous start-of-line request is still running
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)

        vi.advanceTimersByTime(100)

        // Enqueuing a non start-of-line-request does not cancel the last start-of-line
        const fourthThrottledRequest = service.throttle(createRequest('\tfoo█'), TriggerKind.Manual)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(fourthThrottledRequest).resolves.toMatchObject({
            docContext: { currentLinePrefix: '\tfoo' },
        })
    })

    it('promotes tail request after timeout', async () => {
        const firstThrottledRequest = await service.throttle(createRequest('f█'), TriggerKind.Manual)
        const secondThrottledRequest = await service.throttle(createRequest('fo█'), TriggerKind.Manual)

        // The first promise is promoted so it will not be cancelled and coexist with the
        // tail request
        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(false)

        // Enqueuing a third request will cancel the second one
        const thirdThrottledRequest = await service.throttle(createRequest('foo█'), TriggerKind.Manual)

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)

        // The third request will be promoted if enough time passes since the last promotion
        vi.advanceTimersByTime(THROTTLE_TIMEOUT + 10)

        const fourthThrottledRequest = await service.throttle(createRequest('foo█'), TriggerKind.Manual)

        expect(firstThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(secondThrottledRequest?.abortSignal?.aborted).toBe(true)
        expect(thirdThrottledRequest?.abortSignal?.aborted).toBe(false)
        expect(fourthThrottledRequest?.abortSignal?.aborted).toBe(false)
    })

    it('cancels tail requests during the debounce timeout for automatic triggers', async () => {
        const abortController = new AbortController()
        const firstPromise = service.throttle(
            createRequest('foo█', abortController),
            TriggerKind.Automatic
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
        dynamicMultilineCompletions: false,
        context: undefined,
    })
    return {
        docContext,
        document,
        position,
        abortSignal: abortController.signal,
    } as RequestParams
}

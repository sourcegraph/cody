import { describe, expect, test, vi } from 'vitest'

import { dependentAbortController } from './abortController'

describe('derivedAbortController', () => {
    test('returns an instance of AbortController', () => {
        const controller = dependentAbortController()
        expect(controller).toBeInstanceOf(AbortController)
    })

    test('returns an aborted controller if the signal is already aborted', () => {
        const signal = new AbortController()
        signal.abort()
        const controller = dependentAbortController(signal.signal)
        expect(controller.signal.aborted).toBe(true)
    })

    test('aborts when the given signal is aborted', async () =>
        new Promise<void>(done => {
            const parent = new AbortController()
            const controller = dependentAbortController(parent.signal)
            expect(controller.signal.aborted).toBe(false)

            controller.signal.addEventListener('abort', () => {
                expect(controller.signal.aborted).toBe(true)
                done()
            })

            parent.abort()
        }))

    test('removes the abort event listener after aborting', () => {
        const parent = new AbortController()
        const controller = dependentAbortController(parent.signal)
        const abortHandler = vi.fn()
        controller.signal.addEventListener('abort', abortHandler)

        parent.abort()
        expect(abortHandler).toHaveBeenCalledTimes(1)

        // Emit abort event again to check if the listener has been removed.
        parent.abort()
        expect(abortHandler).toHaveBeenCalledTimes(1)
    })
})

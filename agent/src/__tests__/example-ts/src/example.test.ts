import { expect } from 'vitest'
import { it } from 'vitest'
import { describe } from 'vitest'

describe('test block', () => {
    it('does 1', () => {
        expect(true).toBe(true)
    })

    it('does 2', () => {
        expect(true).toBe(true)
    })

    it('does something else', () => {
        // This line will error due to incorrect usage of `performance.now`
        const startTime = performance.now(/* CURSOR */)
    })
})

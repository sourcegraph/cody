import { describe, expect, it } from 'vitest'
import { cssPropertiesToString } from './utils'

describe('cssPropertiesToString', () => {
    it('works for single properties', () => {
        expect(cssPropertiesToString({ color: 'red' })).toBe('color: red;')
    })

    it('works for multiple properties', () => {
        expect(
            cssPropertiesToString({ color: 'red', background: 'blue', display: 'inline-block' })
        ).toBe('color: red;background: blue;display: inline-block;')
    })
})

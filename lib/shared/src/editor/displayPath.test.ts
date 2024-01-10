import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { displayPath, setDisplayPathFn } from './displayPath'

describe('displayPath', () => {
    // Begin tests with no custom function set.
    let origFn: Parameters<typeof setDisplayPathFn>[0]
    beforeEach(() => {
        origFn = setDisplayPathFn(null)
    })
    afterEach(() => {
        setDisplayPathFn(origFn)
    })

    test('throws if no custom function is set', () => {
        expect(() => {
            displayPath('/a/b.ts')
        }).toThrowError('no custom display path function')
    })

    test('should invoke and return the result of the custom function if set', () => {
        const customPath = 'a.ts'
        setDisplayPathFn(() => customPath)
        expect(displayPath('/a/b.ts')).toBe(customPath)
    })
})

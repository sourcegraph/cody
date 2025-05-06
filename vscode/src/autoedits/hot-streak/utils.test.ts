import { describe, expect, it } from 'vitest'
import { LONG_SUGGESTION_USER_CURSOR_MARKER } from '../prompt/constants'
import { postProcessCompletion } from './utils'

describe('postProcessCompletion', () => {
    it('should return the completion as is without any cursor marker', () => {
        const completion = 'foo'
        const result = postProcessCompletion(completion)
        expect(result).toBe(completion)
    })

    it('should return the completion without any cursor marker if present', () => {
        const completion = 'foo' + LONG_SUGGESTION_USER_CURSOR_MARKER + 'bar'
        const result = postProcessCompletion(completion)
        expect(result).toBe('foobar')
    })
})

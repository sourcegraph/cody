import { describe, expect, test } from 'vitest'
import { getPossibleQueryMatch } from './atMentions'

describe('getPossibleQueryMatch', () => {
    test('null if no @ mention is found', () => {
        expect(getPossibleQueryMatch('Hello world')).toBeNull()
    })

    test('@-mention', () => {
        const result = getPossibleQueryMatch('Hello @john')
        expect(result).toEqual({
            leadOffset: 6,
            matchingString: 'john',
            replaceableString: '@john',
        })
    })
})

import { describe, expect, test } from 'vitest'
import { getPossibleQueryMatch } from './atMentions'

describe('getPossibleQueryMatch', () => {
    test('null if no @-mention is found', () => expect(getPossibleQueryMatch('Hello world')).toBeNull())

    test('@-mention', () =>
        expect(getPossibleQueryMatch('Hello @abc')).toEqual({
            leadOffset: 6,
            matchingString: 'abc',
            replaceableString: '@abc',
        }))

    test('@-mention dotfile', () =>
        expect(getPossibleQueryMatch('Hello @.abc')).toEqual({
            leadOffset: 6,
            matchingString: '.abc',
            replaceableString: '@.abc',
        }))

    test('@-mention forward slash', () =>
        expect(getPossibleQueryMatch('Hello @a/b')).toEqual({
            leadOffset: 6,
            matchingString: 'a/b',
            replaceableString: '@a/b',
        }))

    test('@-mention backslash', () =>
        expect(getPossibleQueryMatch('Hello @a\\b')).toEqual({
            leadOffset: 6,
            matchingString: 'a\\b',
            replaceableString: '@a\\b',
        }))
})

import type { MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { describe, expect, test } from 'vitest'
import { getPossibleQueryMatch, parseLineRangeInMention } from './atMentions'

describe('getPossibleQueryMatch', () => {
    test('null if no @-mention is found', () => expect(getPossibleQueryMatch('Hello world')).toBeNull())

    test('@-mention file', () =>
        expect(getPossibleQueryMatch('Hello @abc')).toEqual<MenuTextMatch | null>({
            leadOffset: 6,
            matchingString: 'abc',
            replaceableString: '@abc',
        }))

    test('@-mention symbol', () =>
        expect(getPossibleQueryMatch('Hello @#abc')).toEqual<MenuTextMatch | null>({
            leadOffset: 6,
            matchingString: '#abc',
            replaceableString: '@#abc',
        }))

    describe('special chars', () => {
        test('dotfile', () =>
            expect(getPossibleQueryMatch('Hello @.abc')).toEqual<MenuTextMatch | null>({
                leadOffset: 6,
                matchingString: '.abc',
                replaceableString: '@.abc',
            }))

        test('forward slash', () =>
            expect(getPossibleQueryMatch('Hello @a/b')).toEqual<MenuTextMatch | null>({
                leadOffset: 6,
                matchingString: 'a/b',
                replaceableString: '@a/b',
            }))

        test('backslash', () =>
            expect(getPossibleQueryMatch('Hello @a\\b')).toEqual<MenuTextMatch | null>({
                leadOffset: 6,
                matchingString: 'a\\b',
                replaceableString: '@a\\b',
            }))

        test('hyphen', () =>
            expect(getPossibleQueryMatch('Hello @a-b.txt')).toEqual<MenuTextMatch | null>({
                leadOffset: 6,
                matchingString: 'a-b.txt',
                replaceableString: '@a-b.txt',
            }))
    })

    test('with range', () => {
        expect(getPossibleQueryMatch('a @b/c:')).toBeNull()
        expect(getPossibleQueryMatch('a @b/c:1')).toBeNull()
        expect(getPossibleQueryMatch('a @b/c:12-')).toBeNull()
        expect(getPossibleQueryMatch('a @b/c:12-34')).toEqual<MenuTextMatch>({
            leadOffset: 2,
            matchingString: 'b/c:12-34',
            replaceableString: '@b/c:12-34',
        })
    })
})
describe('parseLineRangeInMention', () => {
    test('invalid line ranges', () => {
        expect(parseLineRangeInMention('')).toEqual({ textWithoutRange: '' })
        expect(parseLineRangeInMention('foo')).toEqual({ textWithoutRange: 'foo' })
        expect(parseLineRangeInMention('foo:')).toEqual({ textWithoutRange: 'foo:' })
        expect(parseLineRangeInMention('foo:1')).toEqual({ textWithoutRange: 'foo:1' })
        expect(parseLineRangeInMention('foo:1-')).toEqual({ textWithoutRange: 'foo:1-' })
        expect(parseLineRangeInMention('foo:-1')).toEqual({ textWithoutRange: 'foo:-1' })
    })

    test('parses line range', () => {
        expect(parseLineRangeInMention('foo:12-34')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 34, character: 0 },
            },
        })
    })
})

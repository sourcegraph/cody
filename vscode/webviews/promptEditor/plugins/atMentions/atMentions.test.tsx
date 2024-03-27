import { describe, expect, test } from 'vitest'
import { parseLineRangeInMention } from './atMentions'

describe('parseLineRangeInMention', () => {
    test('invalid line ranges', () => {
        expect(parseLineRangeInMention('')).toEqual({ textWithoutRange: '' })
        expect(parseLineRangeInMention('foo')).toEqual({ textWithoutRange: 'foo' })
        expect(parseLineRangeInMention('foo:')).toEqual({ textWithoutRange: 'foo:' })
        expect(parseLineRangeInMention('foo:1')).toEqual({ textWithoutRange: 'foo:1' })
        expect(parseLineRangeInMention('foo:1-')).toEqual({ textWithoutRange: 'foo:1-' })
        expect(parseLineRangeInMention('foo:-1')).toEqual({ textWithoutRange: 'foo:-1' })
    })

    test('line range', () => {
        expect(parseLineRangeInMention('foo:12-34')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 34, character: 0 },
            },
        })
    })

    test('single line range', () => {
        expect(parseLineRangeInMention('foo:12-12')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 12, character: 0 },
            },
        })
    })

    test('reversed line range', () => {
        expect(parseLineRangeInMention('foo:34-12')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 34, character: 0 },
            },
        })
    })
})

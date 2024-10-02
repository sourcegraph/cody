//@ts-nocheck
import { describe, expect, test } from 'vitest'

import { FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER } from './api'
import {
    type MentionQuery,
    type MentionTrigger,
    extractRangeFromFileMention,
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
} from './query'

describe('parseMentionQuery', () => {
    test('empty query for empty string', () => {
        expect(parseMentionQuery('', null)).toEqual<MentionQuery>({
            provider: null,
            text: '',
        })
    })

    test('file query without prefix', () => {
        expect(parseMentionQuery('foo', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: 'foo',
            maybeHasRangeSuffix: false,
            range: undefined,
        })
    })

    test('file query with range', () => {
        expect(parseMentionQuery('foo:', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(parseMentionQuery('foo:1', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(parseMentionQuery('foo:1-', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(parseMentionQuery('foo:1-2', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: 'foo',
            range: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } },
            maybeHasRangeSuffix: true,
        })
    })

    test('symbol query without prefix', () => {
        expect(parseMentionQuery('#bar', null)).toEqual<MentionQuery>({
            provider: SYMBOL_CONTEXT_MENTION_PROVIDER.id,
            text: 'bar',
        })
    })

    test('file query with @ prefix', () => {
        // Note: This means that the user is literally looking for a file whose name contains `@`.
        // This is a very rare case. See the docstring for `parseMentionQuery`.
        expect(parseMentionQuery('@baz', null)).toEqual<MentionQuery>({
            provider: FILE_CONTEXT_MENTION_PROVIDER.id,
            text: '@baz',
            maybeHasRangeSuffix: false,
        })
    })
})

describe('scanForMentionTriggerInUserTextInput', () => {
    test('null if no @-mention is found', () =>
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'Hello world',
                includeWhitespace: false,
            })
        ).toBeNull())

    test('@-mention file', () =>
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'Hello @abc',
                includeWhitespace: false,
            })
        ).toEqual<MentionTrigger | null>({
            leadOffset: 6,
            matchingString: 'abc',
            replaceableString: '@abc',
        }))

    test('@-mention symbol', () =>
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'Hello @#abc',
                includeWhitespace: false,
            })
        ).toEqual<MentionTrigger | null>({
            leadOffset: 6,
            matchingString: '#abc',
            replaceableString: '@#abc',
        }))

    test('@-mention URL', () =>
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'Hello @https://example.com/p',
                includeWhitespace: false,
            })
        ).toEqual<MentionTrigger | null>({
            leadOffset: 6,
            matchingString: 'https://example.com/p',
            replaceableString: '@https://example.com/p',
        }))

    describe('special chars', () => {
        test('dotfile', () =>
            expect(
                scanForMentionTriggerInUserTextInput({
                    textBeforeCursor: 'Hello @.abc',
                    includeWhitespace: false,
                })
            ).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: '.abc',
                replaceableString: '@.abc',
            }))

        test('forward slash', () =>
            expect(
                scanForMentionTriggerInUserTextInput({
                    textBeforeCursor: 'Hello @a/b',
                    includeWhitespace: false,
                })
            ).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a/b',
                replaceableString: '@a/b',
            }))

        test('backslash', () =>
            expect(
                scanForMentionTriggerInUserTextInput({
                    textBeforeCursor: 'Hello @a\\b',
                    includeWhitespace: false,
                })
            ).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a\\b',
                replaceableString: '@a\\b',
            }))

        test('hyphen', () =>
            expect(
                scanForMentionTriggerInUserTextInput({
                    textBeforeCursor: 'Hello @a-b.txt',
                    includeWhitespace: false,
                })
            ).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a-b.txt',
                replaceableString: '@a-b.txt',
            }))
    })

    test('with range', () => {
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'a @b/c:12-34',
                includeWhitespace: false,
            })
        ).toEqual<MentionTrigger>({
            leadOffset: 2,
            matchingString: 'b/c:12-34',
            replaceableString: '@b/c:12-34',
        })
    })

    test('with spaces', () => {
        expect(
            scanForMentionTriggerInUserTextInput({
                textBeforeCursor: 'Hello @google-docs Cody architecture ',
                includeWhitespace: true,
            })
        ).toEqual<MentionTrigger>({
            leadOffset: 6,
            matchingString: 'google-docs Cody architecture ',
            replaceableString: '@google-docs Cody architecture ',
        })
    })
})

describe('extractRangeFromFileMention', () => {
    test('invalid line ranges', () => {
        expect(extractRangeFromFileMention('')).toEqual({
            textWithoutRange: '',
            maybeHasRangeSuffix: false,
        })
        expect(extractRangeFromFileMention('foo')).toEqual({
            textWithoutRange: 'foo',
            maybeHasRangeSuffix: false,
        })
        expect(extractRangeFromFileMention('foo:')).toEqual({
            textWithoutRange: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(extractRangeFromFileMention('foo:1')).toEqual({
            textWithoutRange: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(extractRangeFromFileMention('foo:1-')).toEqual({
            textWithoutRange: 'foo',
            maybeHasRangeSuffix: true,
        })
        expect(extractRangeFromFileMention('foo:-1')).toEqual({
            textWithoutRange: 'foo:-1',
            maybeHasRangeSuffix: false,
        })
    })

    test('line range', () => {
        expect(extractRangeFromFileMention('foo:12-34')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 34, character: 0 },
            },
            maybeHasRangeSuffix: true,
        })
    })

    test('single line range', () => {
        expect(extractRangeFromFileMention('foo:12-12')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 12, character: 0 },
            },
            maybeHasRangeSuffix: true,
        })
    })

    test('reversed line range', () => {
        expect(extractRangeFromFileMention('foo:34-12')).toEqual({
            textWithoutRange: 'foo',
            range: {
                start: { line: 11, character: 0 },
                end: { line: 34, character: 0 },
            },
            maybeHasRangeSuffix: true,
        })
    })
})

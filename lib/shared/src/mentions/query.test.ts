import { describe, expect, test } from 'vitest'

import {
    type MentionQuery,
    type MentionTrigger,
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
} from './query'

describe('parseMentionQuery', () => {
    test('returns empty query for empty string', () => {
        expect(parseMentionQuery('')).toEqual<MentionQuery>({
            type: 'empty',
            text: '',
        })
    })

    test('returns file query without prefix', () => {
        expect(parseMentionQuery('foo')).toEqual<MentionQuery>({
            type: 'file',
            text: 'foo',
        })
    })

    test('returns symbol query without prefix', () => {
        expect(parseMentionQuery('#bar')).toEqual<MentionQuery>({
            type: 'symbol',
            text: 'bar',
        })
    })

    test('returns file query with @ prefix', () => {
        expect(parseMentionQuery('@baz')).toEqual<MentionQuery>({
            type: 'file',
            text: '@baz',
        })
    })
})

describe('scanForMentionTriggerInUserTextInput', () => {
    test('null if no @-mention is found', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello world')).toBeNull())

    test('@-mention file', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello @abc')).toEqual<MentionTrigger | null>({
            leadOffset: 6,
            matchingString: 'abc',
            replaceableString: '@abc',
        }))

    test('@-mention symbol', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello @#abc')).toEqual<MentionTrigger | null>({
            leadOffset: 6,
            matchingString: '#abc',
            replaceableString: '@#abc',
        }))

    describe('special chars', () => {
        test('dotfile', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @.abc')).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: '.abc',
                replaceableString: '@.abc',
            }))

        test('forward slash', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @a/b')).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a/b',
                replaceableString: '@a/b',
            }))

        test('backslash', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @a\\b')).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a\\b',
                replaceableString: '@a\\b',
            }))

        test('hyphen', () =>
            expect(
                scanForMentionTriggerInUserTextInput('Hello @a-b.txt')
            ).toEqual<MentionTrigger | null>({
                leadOffset: 6,
                matchingString: 'a-b.txt',
                replaceableString: '@a-b.txt',
            }))
    })

    test('with range', () => {
        expect(scanForMentionTriggerInUserTextInput('a @b/c:')).toBeNull()
        expect(scanForMentionTriggerInUserTextInput('a @b/c:1')).toBeNull()
        expect(scanForMentionTriggerInUserTextInput('a @b/c:12-')).toBeNull()
        expect(scanForMentionTriggerInUserTextInput('a @b/c:12-34')).toEqual<MentionTrigger>({
            leadOffset: 2,
            matchingString: 'b/c:12-34',
            replaceableString: '@b/c:12-34',
        })
    })
})

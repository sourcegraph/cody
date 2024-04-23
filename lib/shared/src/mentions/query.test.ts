import { describe, expect, test } from 'vitest'

import type { ContextMentionProvider } from './api'
import {
    type MentionQuery,
    type MentionTrigger,
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
} from './query'

describe('parseMentionQuery', () => {
    test('empty query for empty string', () => {
        expect(parseMentionQuery('@', '', [])).toEqual<MentionQuery>({
            provider: 'default',
            text: '',
        })
    })

    test('file query without prefix', () => {
        expect(parseMentionQuery('@', 'foo', [])).toEqual<MentionQuery>({
            provider: 'file',
            text: 'foo',
        })
    })

    test('symbol query without prefix', () => {
        expect(parseMentionQuery('@', '#bar', [])).toEqual<MentionQuery>({
            provider: 'symbol',
            text: 'bar',
        })
    })

    test('file query with @ prefix', () => {
        // Note: This means that the user is literally looking for a file whose name contains `@`.
        // This is a very rare case. See the docstring for `parseMentionQuery`.
        expect(parseMentionQuery('@', '@baz', [])).toEqual<MentionQuery>({
            provider: 'file',
            text: '@baz',
        })
    })

    test('url query with http:// prefix', () => {
        const providers: Pick<ContextMentionProvider, 'id' | 'triggerPrefixes' | 'triggers'>[] = [
            {
                id: 'url',
                triggers: ['@'],
                triggerPrefixes: ['http://', 'https://'],
            },
        ]
        expect(parseMentionQuery('@', 'http://example.com/p', providers)).toEqual<MentionQuery>({
            provider: 'url',
            text: 'http://example.com/p',
        })
        expect(parseMentionQuery('@', 'https://example.com/p', providers)).toEqual<MentionQuery>({
            provider: 'url',
            text: 'https://example.com/p',
        })
        expect(parseMentionQuery('#', 'https://example.com', providers)).toEqual({
            provider: 'file',
            text: 'https://example.com',
        })
    })
})

describe('scanForMentionTriggerInUserTextInput', () => {
    test('null if no @-mention is found', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello world')).toBeNull())

    test('#-mention style', () =>
        expect(scanForMentionTriggerInUserTextInput('This is my question #brief')).toEqual<
            ReturnType<typeof scanForMentionTriggerInUserTextInput>
        >({
            trigger: '#',
            leadOffset: 20,
            matchingString: 'brief',
            replaceableString: '#brief',
        }))

    test('@-mention file', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello @abc')).toEqual<MentionTrigger | null>({
            trigger: '@',
            leadOffset: 6,
            matchingString: 'abc',
            replaceableString: '@abc',
        }))

    test('@-mention symbol', () =>
        expect(scanForMentionTriggerInUserTextInput('Hello @#abc')).toEqual<MentionTrigger | null>({
            trigger: '@',
            leadOffset: 6,
            matchingString: '#abc',
            replaceableString: '@#abc',
        }))

    test('@-mention URL', () =>
        expect(
            scanForMentionTriggerInUserTextInput('Hello @https://example.com/p')
        ).toEqual<MentionTrigger | null>({
            trigger: '@',
            leadOffset: 6,
            matchingString: 'https://example.com/p',
            replaceableString: '@https://example.com/p',
        }))

    describe('special chars', () => {
        test('dotfile', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @.abc')).toEqual<MentionTrigger | null>({
                trigger: '@',
                leadOffset: 6,
                matchingString: '.abc',
                replaceableString: '@.abc',
            }))

        test('forward slash', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @a/b')).toEqual<MentionTrigger | null>({
                trigger: '@',
                leadOffset: 6,
                matchingString: 'a/b',
                replaceableString: '@a/b',
            }))

        test('backslash', () =>
            expect(scanForMentionTriggerInUserTextInput('Hello @a\\b')).toEqual<MentionTrigger | null>({
                trigger: '@',
                leadOffset: 6,
                matchingString: 'a\\b',
                replaceableString: '@a\\b',
            }))

        test('hyphen', () =>
            expect(
                scanForMentionTriggerInUserTextInput('Hello @a-b.txt')
            ).toEqual<MentionTrigger | null>({
                trigger: '@',
                leadOffset: 6,
                matchingString: 'a-b.txt',
                replaceableString: '@a-b.txt',
            }))
    })

    test('with range', () => {
        expect(scanForMentionTriggerInUserTextInput('a @b/c:12-34')).toEqual<MentionTrigger>({
            trigger: '@',
            leadOffset: 2,
            matchingString: 'b/c:12-34',
            replaceableString: '@b/c:12-34',
        })
    })
})

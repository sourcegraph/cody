import { describe, expect, it } from 'vitest'

import { CompletionsCache } from './cache'

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo\n' } })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo\n', content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo\nb' } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nb', content: 'ar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo\nba' } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nba', content: 'r' }],
        })
    })

    it('trims trailing whitespace on empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo \n  ', content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo \n  ' } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n  ', content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n ' } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n ', content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n' } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n', content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo ' } })).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo', content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo' } })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo', content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo ' } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo  ' } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo \n' } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo\n' } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo\t' } })).toEqual(undefined)
    })

    it('has a lookup function for untrimmed prefixes', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n  ', content: 'baz' }])

        expect(cache.get({ documentState: { prefix: 'foo\n  ' }, isExactPrefixOnly: true })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [
                {
                    prefix: 'foo\n  ',
                    content: 'baz',
                },
            ],
        })
        expect(cache.get({ documentState: { prefix: 'foo\n ' }, isExactPrefixOnly: true })).toEqual(undefined)
    })
})

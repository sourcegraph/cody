import { describe, expect, it } from 'vitest'

import { CompletionsCache } from './cache'

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get({ prefix: 'foo\n', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo\n', content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get({ prefix: 'foo\nb', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nb', content: 'ar' }],
        })
        expect(cache.get({ prefix: 'foo\nba', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nba', content: 'r' }],
        })
    })

    it('trims trailing whitespace on empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo \n  ', content: 'bar' }])

        expect(cache.get({ prefix: 'foo \n  ', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n  ', content: 'bar' }],
        })
        expect(cache.get({ prefix: 'foo \n ', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n ', content: 'bar' }],
        })
        expect(cache.get({ prefix: 'foo \n', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n', content: 'bar' }],
        })
        expect(cache.get({ prefix: 'foo ', trim: true })).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo', content: 'bar' }])

        expect(cache.get({ prefix: 'foo', trim: true })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo', content: 'bar' }],
        })
        expect(cache.get({ prefix: 'foo ', trim: true })).toEqual(undefined)
        expect(cache.get({ prefix: 'foo  ', trim: true })).toEqual(undefined)
        expect(cache.get({ prefix: 'foo \n', trim: true })).toEqual(undefined)
        expect(cache.get({ prefix: 'foo\n', trim: true })).toEqual(undefined)
        expect(cache.get({ prefix: 'foo\t', trim: true })).toEqual(undefined)
    })

    it('has a lookup function for untrimmed prefixes', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n  ', content: 'baz' }])

        expect(cache.get({ prefix: 'foo\n  ', trim: false })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [
                {
                    prefix: 'foo\n  ',
                    content: 'baz',
                },
            ],
        })
        expect(cache.get({ prefix: 'foo\n ', trim: false })).toEqual(undefined)
    })
})

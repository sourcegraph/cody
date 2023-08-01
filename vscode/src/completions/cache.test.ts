import { describe, expect, it } from 'vitest'

import { CompletionsCache } from './cache'

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get('foo\n')).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo\n', content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n', content: 'bar' }])

        expect(cache.get('foo\nb')).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nb', content: 'ar' }],
        })
        expect(cache.get('foo\nba')).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo\nba', content: 'r' }],
        })
    })

    it('trims trailing whitespace on empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo \n  ', content: 'bar' }])

        expect(cache.get('foo \n  ', true)).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n  ', content: 'bar' }],
        })
        expect(cache.get('foo \n ', true)).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n ', content: 'bar' }],
        })
        expect(cache.get('foo \n', true)).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ prefix: 'foo \n', content: 'bar' }],
        })
        expect(cache.get('foo ', true)).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo', content: 'bar' }])

        expect(cache.get('foo', true)).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ prefix: 'foo', content: 'bar' }],
        })
        expect(cache.get('foo ', true)).toEqual(undefined)
        expect(cache.get('foo  ', true)).toEqual(undefined)
        expect(cache.get('foo \n', true)).toEqual(undefined)
        expect(cache.get('foo\n', true)).toEqual(undefined)
        expect(cache.get('foo\t', true)).toEqual(undefined)
    })

    it('has a lookup function for untrimmed prefixes', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo\n  ', content: 'baz' }])

        expect(cache.get('foo\n  ', false)).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [
                {
                    prefix: 'foo\n  ',
                    content: 'baz',
                },
            ],
        })
        expect(cache.get('foo\n ', false)).toEqual(undefined)
    })

    it('updates the log id for all cached entries', () => {
        const cache = new CompletionsCache()
        cache.add('id1', [{ prefix: 'foo \n  ', content: 'bar' }])
        cache.updateLogId('id1', 'id2')

        expect(cache.get('foo \n  ', true)?.logId).toBe('id2')
        expect(cache.get('foo \n ', true)?.logId).toBe('id2')
        expect(cache.get('foo \n', true)?.logId).toBe('id2')
    })
})

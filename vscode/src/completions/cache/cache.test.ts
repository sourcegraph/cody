import { describe, expect, it } from 'vitest'

import { CompletionsCache, CompletionsCacheDocumentState } from './cache'

function docState(
    prefix: string,
    other?: Partial<Omit<CompletionsCacheDocumentState, 'prefix'>>
): CompletionsCacheDocumentState {
    return {
        uri: 'file:///f',
        prefix,
        position: prefix.length,
        suffix: ';',
        languageId: 'javascript',
        ...other,
    }
}

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('foo\n'), [{ content: 'bar' }])

        expect(cache.get({ documentState: docState('foo\n') })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('foo\n'), [{ content: 'bar' }])

        expect(cache.get({ documentState: docState('foo\nb') })).toEqual({
            logId: 'id1',
            completions: [{ content: 'ar' }],
        })
        expect(cache.get({ documentState: docState('foo\nba') })).toEqual({
            logId: 'id1',
            completions: [{ content: 'r' }],
        })
    })

    it('does not return the cached item when the prefix differs', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('let '), [{ content: 'x = 1' }])
        expect(cache.get({ documentState: docState('zzz x = ') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('zz x = ') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('letz x = ') })).toEqual(undefined)
    })

    it('does not return the cached item when the suffix differs', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('pp', { suffix: 's' }), [{ content: 'c' }])

        expect(cache.get({ documentState: docState('ppp', { suffix: 's2' }) })).toEqual(undefined)
        expect(cache.get({ documentState: docState('pp', { suffix: 's2' }) })).toEqual(undefined)
        expect(cache.get({ documentState: docState('p', { suffix: 's2' }) })).toEqual(undefined)
        expect(cache.get({ documentState: docState('', { suffix: 's2' }) })).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('foo'), [{ content: 'bar' }])

        expect(cache.get({ documentState: docState('foo') })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: docState('foo ') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('foo  ') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('foo \n') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('foo\n') })).toEqual(undefined)
        expect(cache.get({ documentState: docState('foo\t') })).toEqual(undefined)
    })

    it('caches through deletions of prefix', () => {
        const cache = new CompletionsCache()
        cache.add('1', docState('a\nbc '), [{ content: 'd' }])

        expect(cache.get({ documentState: docState('a\nbc ') })).toEqual({
            logId: '1',
            completions: [{ content: 'd' }],
        })
        expect(cache.get({ documentState: docState('a\nbc') })).toEqual({
            logId: '1',
            completions: [{ content: ' d' }],
        })
        expect(cache.get({ documentState: docState('a\nb') })).toEqual({
            logId: '1',
            completions: [{ content: 'c d' }],
        })
        expect(cache.get({ documentState: docState('a\n') })).toEqual({
            logId: '1',
            completions: [{ content: 'bc d' }],
        })

        // Prefixes diverge, so don't serve from cache.
        expect(cache.get({ documentState: docState('a\nx') })).toEqual(undefined)

        // When the user deletes the newline, don't serve from cache.
        expect(cache.get({ documentState: docState('a') })).toEqual(undefined)
    })

    it('has a lookup function for untrimmed prefixes', () => {
        const cache = new CompletionsCache()
        cache.add('id1', docState('foo\n  '), [{ content: 'baz' }])

        expect(cache.get({ documentState: docState('foo\n  '), isExactPrefixOnly: true })).toEqual({
            logId: 'id1',
            completions: [{ content: 'baz' }],
        })
        expect(cache.get({ documentState: docState('foo\n '), isExactPrefixOnly: true })).toEqual(undefined)
    })
})

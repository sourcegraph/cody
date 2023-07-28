import { describe, expect, it } from 'vitest'

import { CompletionsCache, CompletionsCacheDocumentState } from './cache'

const DOC_STATE_FIXTURE: Omit<CompletionsCacheDocumentState, 'prefix'> = {
    languageId: 'javascript',
    suffix: ';',
}

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo\n', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo\n', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo\n', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo\n<|>;': { logId: 'id1', completions: [{ content: 'bar' }] },
            'javascript<|>foo\nb<|>;': { logId: 'id1', completions: [{ content: 'ar' }] },
            'javascript<|>foo\nba<|>;': { logId: 'id1', completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo\nb', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'ar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo\nba', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'r' }],
        })
    })

    it('does not return the cached item when the suffix differs', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { ...DOC_STATE_FIXTURE, prefix: 'p', suffix: 's' }, [{ content: 'c' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>p<|>s': { logId: 'id1', completions: [{ content: 'c' }] },
        })
        expect(cache.get({ documentState: { ...DOC_STATE_FIXTURE, prefix: 'foo\nb', suffix: 's2' } })).toEqual(
            undefined
        )
    })

    it('trims trailing whitespace on empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo \n  ', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo \n<|>;': { logId: 'id1', completions: [{ content: 'bar' }] },
            'javascript<|>foo \n  <|>;': { logId: 'id1', completions: [{ content: 'bar' }] },
            'javascript<|>foo \nb<|>;': { logId: 'id1', completions: [{ content: 'ar' }] },
            'javascript<|>foo \nba<|>;': { logId: 'id1', completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo \n  ', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n ', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo ', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo<|>;': { logId: 'id1', completions: [{ content: 'bar' }] },
            'javascript<|>foob<|>;': { logId: 'id1', completions: [{ content: 'ar' }] },
            'javascript<|>fooba<|>;': { logId: 'id1', completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo ', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo  ', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo \n', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo\n', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
        expect(cache.get({ documentState: { prefix: 'foo\t', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
    })

    it('has a lookup function for untrimmed prefixes', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo\n  ', ...DOC_STATE_FIXTURE }, [{ content: 'baz' }])

        expect(
            cache.get({ documentState: { prefix: 'foo\n  ', ...DOC_STATE_FIXTURE }, isExactPrefixOnly: true })
        ).toEqual({
            logId: 'id1',
            completions: [{ content: 'baz' }],
        })
        expect(
            cache.get({ documentState: { prefix: 'foo\n ', ...DOC_STATE_FIXTURE }, isExactPrefixOnly: true })
        ).toEqual(undefined)
    })
})

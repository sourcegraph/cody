import { describe, expect, it } from 'vitest'

import { CompletionsCache, CompletionsCacheDocumentState } from './cache'

const DOC_STATE_FIXTURE: Omit<CompletionsCacheDocumentState, 'prefix'> = {
    languageId: 'javascript',
}

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo\n', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.get({ documentState: { prefix: 'foo\n', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
            completions: [{ content: 'bar' }],
        })
    })

    it('returns the cached items when the prefix includes characters from the completion', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo\n', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo\n': { logId: 'id1', isExactPrefix: true, completions: [{ content: 'bar' }] },
            'javascript<|>foo\nb': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'ar' }] },
            'javascript<|>foo\nba': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo\nb', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ content: 'ar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo\nba', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ content: 'r' }],
        })
    })

    it('trims trailing whitespace on empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo \n  ', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo \n': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'bar' }] },
            'javascript<|>foo \n  ': { logId: 'id1', isExactPrefix: true, completions: [{ content: 'bar' }] },
            'javascript<|>foo \nb': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'ar' }] },
            'javascript<|>foo \nba': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo \n  ', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n ', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo \n', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: false,
            completions: [{ content: 'bar' }],
        })
        expect(cache.get({ documentState: { prefix: 'foo ', ...DOC_STATE_FIXTURE } })).toEqual(undefined)
    })

    it('does not trim trailing whitespace on non-empty line', () => {
        const cache = new CompletionsCache()
        cache.add('id1', { prefix: 'foo', ...DOC_STATE_FIXTURE }, [{ content: 'bar' }])

        expect(cache.__stateForTestsOnly).toEqual<CompletionsCache['__stateForTestsOnly']>({
            'javascript<|>foo': { logId: 'id1', isExactPrefix: true, completions: [{ content: 'bar' }] },
            'javascript<|>foob': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'ar' }] },
            'javascript<|>fooba': { logId: 'id1', isExactPrefix: false, completions: [{ content: 'r' }] },
        })
        expect(cache.get({ documentState: { prefix: 'foo', ...DOC_STATE_FIXTURE } })).toEqual({
            logId: 'id1',
            isExactPrefix: true,
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
            isExactPrefix: true,
            completions: [{ content: 'baz' }],
        })
        expect(
            cache.get({ documentState: { prefix: 'foo\n ', ...DOC_STATE_FIXTURE }, isExactPrefixOnly: true })
        ).toEqual(undefined)
    })
})

import { describe, expect, it } from 'vitest'

import { Completion } from '../types'

import { CompletionsCache, CompletionsCacheDocumentState } from './cache'

function docState(
    prefix: string,
    other?: Partial<Omit<CompletionsCacheDocumentState, 'prefix'>>
): CompletionsCacheDocumentState {
    return {
        uri: 'file:///file',
        prefix,
        position: prefix.length,
        suffix: ';',
        languageId: 'typescript',
        multiline: false,
        ...other,
    }
}

function completion(content: string): Completion {
    return { content }
}

describe('CompletionsCache', () => {
    it('returns the cached completion items', () => {
        const cache = new CompletionsCache()
        cache.add(docState('foo\n'), [completion('bar')])

        expect(cache.get(docState('foo\n'))).toEqual([{ content: 'bar' }])
    })

    it('evicts unused completions when the cache is full', () => {
        const maxItems = 50
        const cache = new CompletionsCache()

        // // Insert 50 items
        for (let i = 0; i < maxItems; i++) {
            cache.add(docState(`doc-${i}:`), [completion(`completion-${i}`)])
        }

        // Retrieve all but the last item one time
        for (let i = 0; i < maxItems - 1; i++) {
            expect(cache.get(docState(`doc-${i}:`))).toEqual([{ content: `completion-${i}` }])
        }

        // Insert another item
        cache.add(docState('new'), [completion('new')])

        // Expect the 50th item to be evicted
        expect(cache.get(docState('doc-49:'))).toEqual(undefined)
    })

    it('does not trim trailing whitespace', () => {
        const cache = new CompletionsCache()
        cache.add(docState('foo'), [completion('bar')])

        expect(cache.get(docState('foo'))).toEqual([{ content: 'bar' }])
        expect(cache.get(docState('foo '))).toEqual(undefined)
        expect(cache.get(docState('foo  '))).toEqual(undefined)
        expect(cache.get(docState('foo \n'))).toEqual(undefined)
        expect(cache.get(docState('foo\n'))).toEqual(undefined)
        expect(cache.get(docState('foo\t'))).toEqual(undefined)
    })

    it('does not a multi-line request with a single-line entry', () => {
        const cache = new CompletionsCache()
        cache.add(docState('function bubbleSort'), [completion('baz')])
        expect(cache.get(docState('function bubbleSort(', { multiline: true }))).toEqual(undefined)
    })

    describe('when the document is ahead of the completion', () => {
        it('returns the cached items when the prefix includes characters from the completion', () => {
            const cache = new CompletionsCache()
            cache.add(docState('foo\n'), [completion('bar')])

            expect(cache.get(docState('foo\nb'))).toEqual([{ content: 'ar' }])
            expect(cache.get(docState('foo\nba'))).toEqual([{ content: 'r' }])
        })

        it('does not return the cached item when the suffix differs', () => {
            const cache = new CompletionsCache()
            cache.add(docState('p', { suffix: 's' }), [completion('c')])

            expect(cache.get(docState('foo\nb', { suffix: 's2' }))).toEqual(undefined)
        })

        it('does not return cached items when the prefix differs', () => {
            const cache = new CompletionsCache()
            cache.add(docState('foo\n'), [completion('bar')])

            expect(cache.get(docState('kuh\nb'))).toBeUndefined()
            expect(cache.get(docState('kuh\nba'))).toBeUndefined()
        })
    })

    describe('when the document is behind the completion', () => {
        it('caches through deletions of prefix', () => {
            const cache = new CompletionsCache()
            cache.add(docState('a\nbc '), [completion('d')])

            expect(cache.get(docState('a\nbc '))).toEqual([{ content: 'd' }])
            expect(cache.get(docState('a\nbc'))).toEqual([{ content: ' d' }])
            expect(cache.get(docState('a\nb'))).toEqual([{ content: 'c d' }])
            expect(cache.get(docState('a\n'))).toEqual([{ content: 'bc d' }])
        })

        it('does not return cached items when the prefix differs', () => {
            const cache = new CompletionsCache()
            cache.add(docState('a\nbc '), [completion('d')])

            // Prefixes diverge, so don't serve from cache.
            expect(cache.get(docState('a\nx'))).toEqual(undefined)
        })

        it('does not return a cached item if a user deletes the newline', () => {
            const cache = new CompletionsCache()
            cache.add(docState('a\nbc '), [completion('d')])

            expect(cache.get(docState('a'))).toEqual(undefined)
        })
    })
})

import { describe, expect, test } from 'vitest'

import { hydrateAfterPostMessage, isDehydratedUri } from './hydrateAfterPostMessage'

// Mock URI hydration function
const mockHydrateUri = (value: unknown) => {
    return { hydrated: true, originalValue: value }
}

describe('lazyHydrateAfterPostMessage', () => {
    test('handles non-object values', () => {
        expect(hydrateAfterPostMessage(7, mockHydrateUri)).toEqual(7)
    })

    test('handles shallow, non-URI values', () => {
        expect(hydrateAfterPostMessage({ foo: 7, bar: 'hello' }, mockHydrateUri)).toEqual({
            foo: 7,
            bar: 'hello',
        })
    })

    test('handles deep values', () => {
        expect(hydrateAfterPostMessage({ foo: { bar: 'qux' } }, mockHydrateUri)).toEqual({
            foo: { bar: 'qux' },
        })
    })

    test('handles URI values', () => {
        const uri = { $mid: 1, path: '/path/to/resource', scheme: 'file' }
        expect(isDehydratedUri(uri)).toBe(true)
        expect(hydrateAfterPostMessage({ foo: uri }, mockHydrateUri)).toEqual({
            foo: {
                hydrated: true,
                originalValue: { $mid: 1, path: '/path/to/resource', scheme: 'file' },
            },
        })
    })

    test('handles arrays', () => {
        const uriA = { $mid: 1, path: '/path/to/resource/1', scheme: 'file' }
        const uriB = { $mid: 2, path: '/path/to/resource/2', scheme: 'file' }
        expect(hydrateAfterPostMessage([uriA, uriB, uriA], mockHydrateUri)).toEqual([
            {
                hydrated: true,
                originalValue: { $mid: 1, path: '/path/to/resource/1', scheme: 'file' },
            },
            { hydrated: true, originalValue: { $mid: 2, path: '/path/to/resource/2', scheme: 'file' } },
            { hydrated: true, originalValue: { $mid: 1, path: '/path/to/resource/1', scheme: 'file' } },
        ])
    })

    test('modifications to the dehydrated object are reflected in the returned object', () => {
        const originalValue: any = { foo: { bar: 'qux' } }
        const hydratedValue = hydrateAfterPostMessage(originalValue, mockHydrateUri)
        originalValue.foo = 'glorp'
        expect(hydratedValue.foo).toEqual('glorp')
    })

    test('modifications to the returned value are reflected in the dehydrated object', () => {
        const originalValue = { foo: { bar: 'qux' } }
        const hydratedValue = hydrateAfterPostMessage(originalValue, mockHydrateUri)
        hydratedValue.foo.bar = 'baz'
        expect(originalValue.foo.bar).toEqual('baz')
    })
})

describe('hydrateAfterPostMessage', () => {
    // The fixture data is a function that returns the data because hydrateAfterPostMessage mutates
    // its argument.
    test('re-hydrates a dehydrated URI object', () => {
        const dehydratedUri = () => ({ $mid: 1, path: '/path/to/resource', scheme: 'file' })
        expect(hydrateAfterPostMessage(dehydratedUri(), mockHydrateUri)).toEqual(
            mockHydrateUri(dehydratedUri())
        )
    })

    test('re-hydrates an array of dehydrated URIs', () => {
        const dehydratedUris = () => [{ $mid: 1, path: '/path/to/resource', scheme: 'file' }]
        expect(hydrateAfterPostMessage(dehydratedUris(), mockHydrateUri)).toEqual(
            dehydratedUris().map(mockHydrateUri)
        )
    })

    test('re-hydrates nested objects containing dehydrated URIs', () => {
        const nestedObject = () => ({
            foo: 123,
            level1: {
                array: [1, true],
                uri1: { $mid: 1, path: '/path/to/resource', scheme: 'file' },
                uri2: { authority: '', path: '/foo', fragment: '', query: '' },
            },
        })
        expect(hydrateAfterPostMessage(nestedObject(), mockHydrateUri)).toEqual({
            foo: 123,
            level1: {
                array: [1, true],
                uri1: mockHydrateUri(nestedObject().level1.uri1),
                uri2: mockHydrateUri(nestedObject().level1.uri2),
            },
        })
    })

    test('handles null and undefined values correctly', () => {
        expect(hydrateAfterPostMessage(null, mockHydrateUri)).toBeNull()
        expect(hydrateAfterPostMessage(undefined, mockHydrateUri)).toBeUndefined()
    })
})

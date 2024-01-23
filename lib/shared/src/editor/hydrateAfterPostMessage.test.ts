import { describe, expect, test } from 'vitest'

import { hydrateAfterPostMessage } from './hydrateAfterPostMessage'

// Mock URI hydration function
const mockHydrateUri = (value: unknown) => {
    return { hydrated: true, originalValue: value }
}

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

import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { displayPathForWebviews, updateWorkspaceFolderUris, uriHasPrefix } from './displayPath'

/**
 * Tests displayPath function using the custom display path function {@link displayPathForWebviews}.
 */
describe('displayPathForWebviews', () => {
    test('no workspace folders', () => {
        updateWorkspaceFolderUris([])
        expect(displayPathForWebviews(URI.file('/foo/bar.ts'))).toBe('/foo/bar.ts')
        expect(displayPathForWebviews(URI.parse('https://example.com/foo/bar.ts'))).toBe(
            'https://example.com/foo/bar.ts'
        )
    })

    test('1 workspace folder', () => {
        updateWorkspaceFolderUris(['file:///workspace'])
        expect(displayPathForWebviews(URI.file('/workspace/foo/bar.ts'))).toBe('foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/other/foo/bar.ts'))).toBe('/other/foo/bar.ts')
        expect(displayPathForWebviews(URI.parse('https://example.com/foo/bar.ts'))).toBe(
            'https://example.com/foo/bar.ts'
        )
    })

    test('2 workspace folders', () => {
        updateWorkspaceFolderUris(['file:///workspace1', 'file:///workspace2'])
        expect(displayPathForWebviews(URI.file('/workspace1/foo/bar.ts'))).toBe('workspace1/foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/workspace2/foo/bar.ts'))).toBe('workspace2/foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/other/foo/bar.ts'))).toBe('/other/foo/bar.ts')
        expect(displayPathForWebviews(URI.parse('https://example.com/foo/bar.ts'))).toBe(
            'https://example.com/foo/bar.ts'
        )
    })
})

describe('uriHasPrefix', () => {
    test('same url', () =>
        expect(uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('https://example.com/a/b'))).toBe(true))

    test('path prefix', () => {
        expect(uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('https://example.com/a'))).toBe(true)
        expect(uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('other://example.com/a'))).toBe(false)
        expect(uriHasPrefix(URI.parse('https://example.com/a/b'), URI.parse('https://example.com/a/'))).toBe(true)
        expect(uriHasPrefix(URI.parse('https://example.com/a'), URI.parse('https://example.com/a/'))).toBe(true)
        expect(uriHasPrefix(URI.parse('https://example.com/a-b'), URI.parse('https://example.com/a'))).toBe(false)
    })
})

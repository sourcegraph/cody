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
        expect(displayPathForWebviews(URI.parse('https://ex.com/foo/bar.ts'))).toBe('https://ex.com/foo/bar.ts')
    })

    test('1 workspace folder', () => {
        updateWorkspaceFolderUris(['file:///workspace'])
        expect(displayPathForWebviews(URI.file('/workspace/foo/bar.ts'))).toBe('foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/other/foo/bar.ts'))).toBe('/other/foo/bar.ts')
        expect(displayPathForWebviews(URI.parse('https://ex.com/foo/bar.ts'))).toBe('https://ex.com/foo/bar.ts')
    })

    test('2 workspace folders', () => {
        updateWorkspaceFolderUris(['file:///workspace1', 'file:///workspace2'])
        expect(displayPathForWebviews(URI.file('/workspace1/foo/bar.ts'))).toBe('workspace1/foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/workspace2/foo/bar.ts'))).toBe('workspace2/foo/bar.ts')
        expect(displayPathForWebviews(URI.file('/other/foo/bar.ts'))).toBe('/other/foo/bar.ts')
        expect(displayPathForWebviews(URI.parse('https://ex.com/foo/bar.ts'))).toBe('https://ex.com/foo/bar.ts')
    })
})

describe('uriHasPrefix', () => {
    test('same url', () =>
        expect(uriHasPrefix(URI.parse('https://ex.com/a/b'), URI.parse('https://ex.com/a/b'), false)).toBe(true))

    test('https path prefix', () => {
        expect(uriHasPrefix(URI.parse('https://ex.com/a/b'), URI.parse('https://ex.com/a'), false)).toBe(true)
        expect(uriHasPrefix(URI.parse('https://ex.com/a/b'), URI.parse('other://ex.com/a'), false)).toBe(false)
        expect(uriHasPrefix(URI.parse('https://ex.com/a/b'), URI.parse('https://ex.com/a/'), false)).toBe(true)
        expect(uriHasPrefix(URI.parse('https://ex.com/a'), URI.parse('https://ex.com/a/'), false)).toBe(true)
        expect(uriHasPrefix(URI.parse('https://ex.com/a-b'), URI.parse('https://ex.com/a'), false)).toBe(false)
    })

    test('file path prefix', () => {
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///a'), false)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///A'), false)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///a/b'), URI.parse('file:///b'), false)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/a'), true)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///C:/a'), true)).toBe(true)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/A'), true)).toBe(false)
        expect(uriHasPrefix(URI.parse('file:///c:/a/b'), URI.parse('file:///c:/b'), true)).toBe(false)
    })
})

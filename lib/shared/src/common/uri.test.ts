import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { uriBasename, uriDirname, uriExtname, uriParseNameAndExtension } from './uri'

describe('uriDirname', () => {
    test('', () => {
        expect(uriDirname(URI.parse('file:///a/b/c')).toString()).toBe('file:///a/b')
        expect(uriDirname(URI.parse('https://example.com/a/b')).toString()).toBe('https://example.com/a')
        expect(uriDirname(URI.parse('https://example.com/a/')).toString()).toBe('https://example.com/')
        expect(uriDirname(URI.parse('https://example.com/')).toString()).toBe('https://example.com/')
    })
})

describe('uriBasename', () => {
    test('', () => {
        expect(uriBasename(URI.parse('file:///a/b/c')).toString()).toBe('c')
        expect(uriBasename(URI.parse('https://example.com/a/b')).toString()).toBe('b')
        expect(uriBasename(URI.parse('file:///c:/a/b')).toString()).toBe('b')
        expect(uriBasename(URI.parse('file:///c:/')).toString()).toBe('c:')
        expect(uriBasename(URI.parse('file:///c:')).toString()).toBe('c:')
        expect(uriBasename(URI.parse('file:///c%3A')).toString()).toBe('c:')
        expect(uriBasename(URI.parse('file:///a/b%20c')).toString()).toBe('b c')
    })
})

describe('uriExtname', () => {
    test('', () => {
        expect(uriExtname(URI.parse('file:///a/b.txt')).toString()).toBe('.txt')
        expect(uriExtname(URI.parse('https://example.com/a/b.test.rb')).toString()).toBe('.rb')
        expect(uriExtname(URI.parse('file:///c:/a/.foo.js')).toString()).toBe('.js')
        expect(uriExtname(URI.parse('file:///a/b')).toString()).toBe('')
    })
})

describe('uriParseNameAndExtension', () => {
    test('', () => {
        expect(uriParseNameAndExtension(URI.parse('file:///a/b.txt'))).toEqual<
            ReturnType<typeof uriParseNameAndExtension>
        >({ name: 'b', ext: '.txt' })
    })
})

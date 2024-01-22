import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import {
    languageFromFilename as _languageFromFilename,
    markdownCodeBlockLanguageIDForFilename,
} from './languages'

describe('languageFromFilename', () => {
    function languageFromFilename(name: string): ReturnType<typeof _languageFromFilename> {
        return _languageFromFilename(URI.parse(`file:///${name}`))
    }

    test('', () => {
        expect(languageFromFilename('foo.java')).toBe('Java')
        expect(languageFromFilename('foo.go')).toBe('Go')
        expect(languageFromFilename('foo.js')).toBe('JavaScript')
        expect(languageFromFilename('foo.mjs')).toBe('JavaScript')
        expect(languageFromFilename('foo.jsx')).toBe('JavaScript')
        expect(languageFromFilename('foo.tsx')).toBe('TypeScript')
        expect(languageFromFilename('foo.ts')).toBe('TypeScript')
        expect(languageFromFilename('foo.cts')).toBe('TypeScript')
        expect(languageFromFilename('foo.cpp')).toBe('C++')
        expect(languageFromFilename('foo.php')).toBe('PHP')
        expect(languageFromFilename('foo.md')).toBe('Markdown')
        expect(languageFromFilename('foo.txt')).toBe('Plain text')
        expect(languageFromFilename('foo.py')).toBe('Python')
    })
})

describe('markdownCodeBlockLanguageIDForFilename', () => {
    test('simple', () => {
        expect(markdownCodeBlockLanguageIDForFilename(URI.parse('file:///foo.java'))).toBe('java')
        expect(markdownCodeBlockLanguageIDForFilename(URI.parse('file:///foo.go'))).toBe('go')
    })
    test('complex', () => {
        expect(markdownCodeBlockLanguageIDForFilename(URI.parse('file:///foo.js'))).toBe('javascript')
        expect(markdownCodeBlockLanguageIDForFilename(URI.parse('file:///foo.ts'))).toBe('typescript')
        expect(markdownCodeBlockLanguageIDForFilename(URI.parse('file:///foo.tsx'))).toBe('typescript')
    })
})

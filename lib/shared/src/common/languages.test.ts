import { describe, expect, test } from 'vitest'

import { languageFromFilename, markdownCodeBlockLanguageIDForFilename } from './languages'

describe('languageFromFilename', () => {
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
        expect(markdownCodeBlockLanguageIDForFilename('foo.java')).toBe('java')
        expect(markdownCodeBlockLanguageIDForFilename('foo.go')).toBe('go')
    })
    test('complex', () => {
        expect(markdownCodeBlockLanguageIDForFilename('foo.js')).toBe('javascript')
        expect(markdownCodeBlockLanguageIDForFilename('foo.ts')).toBe('typescript')
        expect(markdownCodeBlockLanguageIDForFilename('foo.tsx')).toBe('typescript')
    })
})

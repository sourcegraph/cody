import { describe, expect, it } from 'vitest'

import { getLanguageForFileName } from './language'
import extensionMapping from './language-file-extensions.json'

describe('getLanguageForFileName', () => {
    it('gets languages', () => {
        expect(getLanguageForFileName('test.go')).toBe('go')
        expect(getLanguageForFileName('test.java')).toBe('java')
        expect(getLanguageForFileName('test.ts')).toBe('typescript')
        expect(getLanguageForFileName('test.js')).toBe('javascript')
    })

    it('gets languages from multiple extension values', () => {
        expect(getLanguageForFileName('test.es')).toBe('javascript')
        expect(getLanguageForFileName('test.jsm')).toBe('javascript')
        expect(getLanguageForFileName('test.lisp')).toBe('lisp')
        expect(getLanguageForFileName('test.lsp')).toBe('lisp')
        expect(getLanguageForFileName('test.kt')).toBe('kotlin')
        expect(getLanguageForFileName('test.ktm')).toBe('kotlin')
        expect(getLanguageForFileName('test.kts')).toBe('kotlin')
    })

    it('gets custom languages overrides  ', () => {
        expect(getLanguageForFileName('test.jsx')).toBe('javascriptreact')
        expect(getLanguageForFileName('test.tsx')).toBe('typescriptreact')
    })

    it('returns the extension if the language is unknown', () => {
        expect(getLanguageForFileName('test.bad')).toBe('bad')
        expect(getLanguageForFileName('test.invalid')).toBe('invalid')
    })

    it('returns the extension event when there is a path', () => {
        expect(getLanguageForFileName('/test/folder/test.js')).toBe('javascript')
        expect(getLanguageForFileName('test/folder/file.js')).toBe('javascript')
    })

    it('handles files with no extension', () => {
        expect(getLanguageForFileName('/test/folder/Dockerfile')).toBe('dockerfile')
        expect(getLanguageForFileName('/test/folder/BUILD')).toBe('starlark')
    })

    it('handles bad data', () => {
        expect(getLanguageForFileName('#$%^&^%')).toBe('#$%^&^%')
        expect(getLanguageForFileName('')).toBe('')
    })
})

describe('language-file-extensions.json mappings', () => {
    it('has no duplicates', () => {
        const mappings = new Map<string, string>()
        for (const [language, extensions] of Object.entries(extensionMapping)) {
            for (const extension of extensions) {
                expect(mappings.get(extension)).toBeUndefined()
                mappings.set(extension, language)
            }
        }
    })
})

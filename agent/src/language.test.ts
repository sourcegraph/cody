import assert from 'assert'

import { describe, it } from 'vitest'

import { getLanguageForFileName } from './language'

describe('getLanguageForFileName', () => {
    it('gets languages', () => {
        assert.equal(getLanguageForFileName('test.go'), 'go')
        assert.equal(getLanguageForFileName('test.java'), 'java')
        assert.equal(getLanguageForFileName('test.ts'), 'typescript')
        assert.equal(getLanguageForFileName('test.js'), 'javascript')
    })

    it('gets languages from multiple extension values', () => {
        assert.equal(getLanguageForFileName('test.es'), 'javascript')
        assert.equal(getLanguageForFileName('test.jsm'), 'javascript')
        assert.equal(getLanguageForFileName('test.lisp'), 'lisp')
        assert.equal(getLanguageForFileName('test.lsp'), 'lisp')
        assert.equal(getLanguageForFileName('test.kt'), 'kotlin')
        assert.equal(getLanguageForFileName('test.ktm'), 'kotlin')
        assert.equal(getLanguageForFileName('test.kts'), 'kotlin')
    })

    it('gets custom languages overrides  ', () => {
        assert.equal(getLanguageForFileName('test.jsx'), 'javascriptreact')
        assert.equal(getLanguageForFileName('test.tsx'), 'typescriptreact')
    })

    it('returns the extension if the language is unknown', () => {
        assert.equal(getLanguageForFileName('test.bad'), 'bad')
        assert.equal(getLanguageForFileName('test.invalid'), 'invalid')
    })
})

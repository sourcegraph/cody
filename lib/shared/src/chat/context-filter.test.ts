import { describe, expect, it } from 'vitest'

import { testFilePath } from '../test/path-helpers'

import { CODY_IGNORE_FILENAME, isCodyIgnoredFile, setCodyIgnoreList } from './context-filter'

describe('isCodyIgnoredFile', () => {
    const codyIgnoreFilePath = testFilePath(CODY_IGNORE_FILENAME)
    // Set the ignore list to the following content:
    const codyIgnoreFileContent = `
        node_modules/
        **/cody
        **/foo/**
        /bar
        fooz
        barz/*
        .git
        one/**/two
        `
    setCodyIgnoreList(codyIgnoreFilePath, codyIgnoreFileContent)

    it('returns false for no file name', () => {
        expect(isCodyIgnoredFile('')).toBe(false)
    })

    it('returns true for .env file even if it is not in the ignore list', () => {
        expect(isCodyIgnoredFile(testFilePath('.env'))).toBe(true)
    })

    it.each([
        'node_modules/foo',
        'cody',
        'cody/test.ts',
        'foo/foobarz.js',
        'foo/bar',
        'fooz',
        '.git',
        'barz/index.css',
        'barz/foo/index.css',
        'foo/bar/index.css',
        'foo/.git',
        '.git/foo',
        'one/two',
        'one/two/three',
        'one/a/two',
        'one/a/two/three',
    ])('returns true for file in ignore list %s', (file: string) => {
        expect(isCodyIgnoredFile(testFilePath(file))).toBe(true)
    })

    it.each([
        'src/app.ts',
        'barz',
        'env/foobarz.js',
        'foobar.go',
        '.barz',
        '.gitignore',
        'cody.ts',
        'one/three',
        'two/one',
    ])('returns false for file not in ignore list %s', (file: string) => {
        expect(isCodyIgnoredFile(testFilePath(file))).toBe(false)
    })

    it('returns updated value after modifying the ignore list', () => {
        const beforeModifiedCodyIgnoreFileContent = `
        node_modules
        cody/
        `
        setCodyIgnoreList(codyIgnoreFilePath, beforeModifiedCodyIgnoreFileContent)

        expect(isCodyIgnoredFile(testFilePath('cody/index.html'))).toBe(true)

        const afterModifiedCodyIgnoreFileContent = `
        node_modules
        `
        setCodyIgnoreList(codyIgnoreFilePath, afterModifiedCodyIgnoreFileContent)
        expect(isCodyIgnoredFile(testFilePath('cody/index.html'))).toBe(false)
    })
})

import { describe, expect, it } from 'vitest'

import { isCodyIgnoreFile, setCodyIgnoreList } from './context-filter'

describe('isCodyIgnoreFile', () => {
    // Set the ignore list to the following content:
    const codyIgnoreFileContent = `
        node_modules
        **/cody
        **/foo/**
        /bar
        fooz
        barz/**
        .git
        `
    setCodyIgnoreList(codyIgnoreFileContent)

    it('returns false for no file name', () => {
        expect(isCodyIgnoreFile()).toBe(false)
    })

    it('returns true for .env file even if it is not in the ignore list', () => {
        expect(isCodyIgnoreFile('.env')).toBe(true)
    })

    it.each([
        'node_modules/foo',
        'cody',
        'cody.ts',
        'cody/test.ts',
        'foo/bar',
        'foo/bar/index.css',
        'foo/foobarz.js',
        'fooz',
        'barz/foo',
        '.git',
        '.gitignore',
        '.git/foo',
        'foo/.git',
    ])('returns true for file in ignore list %s', (file: string) => {
        expect(isCodyIgnoreFile(file)).toBe(true)
    })

    it.each(['src/app.ts', 'env/foobarz.js', 'foobar.go', '.barz', 'bar'])(
        'returns false for file not in ignore list %s',
        (file: string) => {
            expect(isCodyIgnoreFile(file)).toBe(false)
        }
    )

    it('returns updated value after modifying the ignore list', () => {
        const beforeModifiedCodyIgnoreFileContent = `
        node_modules
        cody
        `
        setCodyIgnoreList(beforeModifiedCodyIgnoreFileContent)

        expect(isCodyIgnoreFile('cody/index.html')).toBe(true)

        const afterModifiedCodyIgnoreFileContent = `
        node_modules
        `
        setCodyIgnoreList(afterModifiedCodyIgnoreFileContent)
        expect(isCodyIgnoreFile('cody/index.html')).toBe(false)
    })
})

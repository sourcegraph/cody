import { describe, expect, it } from 'vitest'

import { isCodyIgnoredFile, setCodyIgnoreList } from './context-filter'

describe('isCodyIgnoredFile', () => {
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
        expect(isCodyIgnoredFile()).toBe(false)
    })

    it('returns true for .env file even if it is not in the ignore list', () => {
        expect(isCodyIgnoredFile('.env')).toBe(true)
    })

    it.each([
        'node_modules/foo',
        'cody',
        'cody/test.ts',
        'foo/bar',
        'foo/bar/index.css',
        'foo/foobarz.js',
        'fooz',
        '.git',
        '.git/foo',
        'foo/.git',
    ])('returns true for file in ignore list %s', (file: string) => {
        expect(isCodyIgnoredFile(file)).toBe(true)
    })

    it.each(['src/app.ts', 'env/foobarz.js', 'foobar.go', '.barz', 'bar', '.gitignore', 'barz/foo', 'cody.ts'])(
        'returns false for file not in ignore list %s',
        (file: string) => {
            expect(isCodyIgnoredFile(file)).toBe(false)
        }
    )

    it('returns updated value after modifying the ignore list', () => {
        const beforeModifiedCodyIgnoreFileContent = `
        node_modules
        cody
        `
        setCodyIgnoreList(beforeModifiedCodyIgnoreFileContent)

        expect(isCodyIgnoredFile('cody/index.html')).toBe(true)

        const afterModifiedCodyIgnoreFileContent = `
        node_modules
        `
        setCodyIgnoreList(afterModifiedCodyIgnoreFileContent)
        expect(isCodyIgnoredFile('cody/index.html')).toBe(false)
    })
})

import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { pathFunctionsForURI, posixAndURIPaths } from './path'

describe('pathFunctions', () => {
    describe('nonWindows', () => {
        const nonWindowsFSPath = pathFunctionsForURI(URI.file(''), false)
        test('dirname', () => {
            expect(nonWindowsFSPath.dirname('/a/b/c')).toBe('/a/b')
            expect(nonWindowsFSPath.dirname('/a/b')).toBe('/a')
            expect(nonWindowsFSPath.dirname('/a/b/')).toBe('/a')
            expect(nonWindowsFSPath.dirname('/a')).toBe('/')
            expect(nonWindowsFSPath.dirname('/a/')).toBe('/')
            expect(nonWindowsFSPath.dirname('/')).toBe('/')
            expect(nonWindowsFSPath.dirname('')).toBe('.')
            expect(nonWindowsFSPath.dirname('a')).toBe('.')
        })
        test('basename', () => {
            expect(nonWindowsFSPath.basename('/a/b/c')).toBe('c')
            expect(nonWindowsFSPath.basename('/a/b')).toBe('b')
            expect(nonWindowsFSPath.basename('/a/b/')).toBe('b')
            expect(nonWindowsFSPath.basename('/a')).toBe('a')
            expect(nonWindowsFSPath.basename('/a/')).toBe('a')
            expect(nonWindowsFSPath.basename('/')).toBe('')
            expect(nonWindowsFSPath.basename('')).toBe('')
            expect(nonWindowsFSPath.basename('a')).toBe('a')
        })
        test('relative', () => {
            expect(posixAndURIPaths.relative('/a/b', '/a/b/c')).toBe('c')
            expect(posixAndURIPaths.relative('/a/b/', '/a/b/c')).toBe('c')
            expect(posixAndURIPaths.relative('/a', '/a/b/c')).toBe('b/c')
            expect(posixAndURIPaths.relative('/a', '/a')).toBe('')
            expect(posixAndURIPaths.relative('/a/', '/a')).toBe('')
            expect(posixAndURIPaths.relative('/a', '/a/')).toBe('')
            expect(posixAndURIPaths.relative('/a/', '/a/')).toBe('')
            expect(posixAndURIPaths.relative('/', '/a/b/c')).toBe('a/b/c')
            expect(posixAndURIPaths.relative('/a/b', '/a')).toBe('..')
            expect(posixAndURIPaths.relative('/a/b', '/a/')).toBe('..')
            expect(posixAndURIPaths.relative('/a/b/', '/a/')).toBe('..')
            expect(posixAndURIPaths.relative('/a/b', '/a/')).toBe('..')
            expect(posixAndURIPaths.relative('/a/b/c/d', '/a/b/c')).toBe('..')
            expect(posixAndURIPaths.relative('/a/b/c/d', '/a')).toBe('../../..')
            expect(posixAndURIPaths.relative('a', '/a')).toBe('/a')
            expect(posixAndURIPaths.relative('a/b', '/a')).toBe('/a')
            expect(posixAndURIPaths.relative('a', '/c')).toBe('/c')
            expect(posixAndURIPaths.relative('a/b', '/c')).toBe('/c')
        })
    })

    describe('windows', () => {
        const windowsFSPath = pathFunctionsForURI(URI.file(''), true)
        test('dirname', () => {
            expect(windowsFSPath.dirname('C:\\a\\b\\c')).toBe('C:\\a\\b')
            expect(windowsFSPath.dirname('C:\\a\\b')).toBe('C:\\a')
            expect(windowsFSPath.dirname('C:\\a')).toBe('C:\\')
            expect(windowsFSPath.dirname('C:\\a\\')).toBe('C:\\')
            expect(windowsFSPath.dirname('C:\\')).toBe('C:\\')
            expect(windowsFSPath.dirname('C:')).toBe('C:')
            expect(windowsFSPath.dirname('a\\b')).toBe('a')
            expect(windowsFSPath.dirname('\\a\\b')).toBe('\\a')
            expect(windowsFSPath.dirname('a')).toBe('.')
            expect(windowsFSPath.dirname('\\a')).toBe('\\')
        })
        test('basename', () => {
            expect(windowsFSPath.basename('C:\\a\\b\\c')).toBe('c')
            expect(windowsFSPath.basename('C:\\a\\b')).toBe('b')
            expect(windowsFSPath.basename('C:\\a')).toBe('a')
            expect(windowsFSPath.basename('C:\\a\\')).toBe('a')
            expect(windowsFSPath.basename('C:\\')).toBe('')
            expect(windowsFSPath.basename('C:')).toBe('')
            expect(windowsFSPath.basename('')).toBe('')
            expect(windowsFSPath.basename('a\\b')).toBe('b')
            expect(windowsFSPath.basename('\\a\\b')).toBe('b')
            expect(windowsFSPath.basename('a')).toBe('a')
            expect(windowsFSPath.basename('\\a')).toBe('a')
        })
    })

    test('extname', () => {
        // extname does not differ in behavior on Windows vs. non-Windows, so we don't need to test
        // it for both platforms.
        const extname = pathFunctionsForURI(URI.file(''), false).extname
        expect(extname('/a/b/c.ts')).toBe('.ts')
        expect(extname('/a/b.XX')).toBe('.XX')
        expect(extname('/a/.a')).toBe('')
        expect(extname('/a/.index.md')).toBe('.md')
        expect(extname('c.test.ts')).toBe('.ts')
        expect(extname('a')).toBe('')
        expect(extname('a.')).toBe('.')
    })
})

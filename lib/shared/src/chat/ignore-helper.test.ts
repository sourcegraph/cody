import path from 'path'

import { beforeEach, describe, expect, it } from 'vitest'
// TODO(dantup): Determine whether we should be using vscode-uri URI here, or vscode.URI/shim
//  (or if we should be testing both).
import { URI, Utils } from 'vscode-uri'

import { testFileUri } from '../test/path-helpers'

import { CODY_IGNORE_FILENAME, IgnoreHelper } from './ignore-helper'

describe('IgnoreHelper', () => {
    let ignore: IgnoreHelper
    const workspace1Root = testFileUri('foo/workspace1')
    const workspace2Root = testFileUri('foo/workspace2')

    function setIgnores(workspaceRoot: string, ignoreFolder: string, rules: string[]) {
        ignore.setIgnoreFiles(workspaceRoot, [
            {
                filePath: path.join(ignoreFolder, CODY_IGNORE_FILENAME),
                content: rules.join('\n'),
            },
        ])
    }

    function setWorkspace1Ignores(rules: string[]) {
        setIgnores(workspace1Root.fsPath, workspace1Root.fsPath, rules)
    }

    function setWorkspace2Ignores(rules: string[]) {
        setIgnores(workspace2Root.fsPath, workspace2Root.fsPath, rules)
    }

    function setWorkspace1NestedIgnores(folder: string, rules: string[]) {
        setIgnores(workspace1Root.fsPath, path.join(workspace1Root.fsPath, folder), rules)
    }

    beforeEach(() => {
        ignore = new IgnoreHelper()
        ignore.setActiveState(true)
    })

    it('returns true for non-file schemed URLs', () => {
        const nonFileWorkspaceRoot = workspace1Root.with({ scheme: 'non-file' })
        expect(ignore.isIgnored(Utils.joinPath(nonFileWorkspaceRoot, 'foo.txt'))).toBe(true)
    })

    it('returns true for non-file schemed URLs - vscode user settings', () => {
        const nonFileWorkspaceRoot = workspace1Root.with({ scheme: 'vscode-userdata' })
        expect(ignore.isIgnored(Utils.joinPath(nonFileWorkspaceRoot, 'settings.json'))).toBe(true)
    })

    it('returns false for an undefined workspace', () => {
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'foo.txt'))).toBe(false)
    })

    it('returns false for a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'foo.txt'))).toBe(false)
    })

    it('returns true for ".env" in an undefined workspace', () => {
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, '.env'))).toBe(true)
    })

    it('returns true for ".env" in a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a nested ".env" in a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a nested ".env" in a workspace with unrelated ignores', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a top-level file ignored at the top level', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'ignored.txt'))).toBe(true)
    })

    it('returns false for a top-level file not ignored at the top level', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'not_ignored.txt'))).toBe(false)
    })

    it('returns false for a top-level file unignored at the top level', () => {
        setWorkspace1Ignores(['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'not_ignored.txt'))).toBe(false)
    })

    it('returns true for a nested file ignored at the top level', () => {
        setWorkspace1Ignores(['always_ignored.txt', 'a/explitly_ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a/always_ignored.txt'))).toBe(true)
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a/explitly_ignored.txt'))).toBe(true)
    })

    it('returns false for a nested file not ignored at the top level', () => {
        setWorkspace1Ignores(['a/ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'b/ignored.txt'))).toBe(false)
    })

    it('returns false for a nested file unignored at the top level', () => {
        setWorkspace1Ignores(['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'b/not_ignored.txt'))).toBe(false)
    })

    it('returns true for a nested file ignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a/ignored.txt'))).toBe(true)
    })

    it('returns false for a nested file not ignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a/not_ignored.txt'))).toBe(false)
    })

    it('returns false for a nested file unignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'a/not_ignored.txt'))).toBe(false)
    })

    it('tracks ignores independently for each workspace root', () => {
        setWorkspace1Ignores(['ignored_1.txt'])
        setWorkspace2Ignores(['ignored_2.txt'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'ignored_1.txt'))).toBe(true)
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, 'ignored_2.txt'))).toBe(false)
        expect(ignore.isIgnored(Utils.joinPath(workspace2Root, 'ignored_1.txt'))).toBe(false)
        expect(ignore.isIgnored(Utils.joinPath(workspace2Root, 'ignored_2.txt'))).toBe(true)
    })

    it('throws on an empty file: URI', () => {
        expect(() => ignore.isIgnored(URI.parse('file:///'))).toThrow()
    })

    it.skip('throws on a relative Uri', () => {
        const relativeFileUri = URI.parse('file://a')
        expect(() => ignore.isIgnored(relativeFileUri)).toThrow()
    })

    it('handles comments and blank lines in the ignore file', () => {
        setWorkspace1Ignores(['#.foo', '', 'bar'])
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, '.env'))).toBe(true)
        expect(ignore.isIgnored(Utils.joinPath(workspace1Root, '.foo'))).toBe(false)
    })

    describe('returns the correct value for a sample of rules', () => {
        beforeEach(() => {
            setWorkspace1Ignores([
                'node_modules/',
                '**/cody',
                '**/foo/**',
                '/bar',
                'fooz',
                'barz/*',
                '.git',
                'one/**/two',
            ])
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
        ])('returns true for file in ignore list %s', (filePath: string) => {
            expect(ignore.isIgnored(Utils.joinPath(workspace1Root, filePath))).toBe(true)
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
        ])('returns false for file not in ignore list %s', (filePath: string) => {
            expect(ignore.isIgnored(Utils.joinPath(workspace1Root, filePath))).toBe(false)
        })
    })
})

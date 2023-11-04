import path from 'path'

import { beforeEach, describe, expect, it } from 'vitest'

import { testFilePath } from '../test/path-helpers'

import { CODY_IGNORE_FILENAME } from './context-filter'
import { IgnoreHelper } from './ignore-helper'

describe('IgnoreHelper', () => {
    let ignore: IgnoreHelper
    const workspace1Root = testFilePath('foo/workspace1')
    const workspace2Root = testFilePath('foo/workspace2')

    function setIgnores(workspaceRoot: string, ignoreFolder: string, rules: string[]) {
        ignore.setIgnoreFiles(workspaceRoot, [
            {
                filePath: path.join(ignoreFolder, CODY_IGNORE_FILENAME),
                content: rules.join('\n'),
            },
        ])
    }

    function setWorkspace1Ignores(rules: string[]) {
        setIgnores(workspace1Root, workspace1Root, rules)
    }

    function setWorkspace2Ignores(rules: string[]) {
        setIgnores(workspace2Root, workspace2Root, rules)
    }

    function setWorkspace1NestedIgnores(folder: string, rules: string[]) {
        setIgnores(workspace1Root, path.join(workspace1Root, folder), rules)
    }

    beforeEach(() => {
        ignore = new IgnoreHelper()
    })

    it('returns false for an undefined workspace', () => {
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'foo.txt'))).toBe(false)
    })

    it('returns false for a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'foo.txt'))).toBe(false)
    })

    it('returns true for ".env" in an undefined workspace', () => {
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, '.env'))).toBe(true)
    })

    it('returns true for ".env" in a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a nested ".env" in a workspace with no ignores', () => {
        setWorkspace1Ignores([])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a nested ".env" in a workspace with unrelated ignores', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a', '.env'))).toBe(true)
    })

    it('returns true for a top-level file ignored at the top level', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'ignored.txt'))).toBe(true)
    })

    it('returns false for a top-level file not ignored at the top level', () => {
        setWorkspace1Ignores(['ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'not_ignored.txt'))).toBe(false)
    })

    it('returns false for a top-level file unignored at the top level', () => {
        setWorkspace1Ignores(['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'not_ignored.txt'))).toBe(false)
    })

    it('returns true for a nested file ignored at the top level', () => {
        setWorkspace1Ignores(['always_ignored.txt', 'a/explitly_ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a/always_ignored.txt'))).toBe(true)
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a/explitly_ignored.txt'))).toBe(true)
    })

    it('returns false for a nested file not ignored at the top level', () => {
        setWorkspace1Ignores(['a/ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'b/ignored.txt'))).toBe(false)
    })

    it('returns false for a nested file unignored at the top level', () => {
        setWorkspace1Ignores(['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'b/not_ignored.txt'))).toBe(false)
    })

    it('returns true for a nested file ignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a/ignored.txt'))).toBe(true)
    })

    it('returns false for a nested file not ignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a/not_ignored.txt'))).toBe(false)
    })

    it('returns false for a nested file unignored at the nested level', () => {
        setWorkspace1NestedIgnores('a', ['*ignored.txt', '!not_ignored.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'a/not_ignored.txt'))).toBe(false)
    })

    it('tracks ignores independently for each workspace root', () => {
        setWorkspace1Ignores(['ignored_1.txt'])
        setWorkspace2Ignores(['ignored_2.txt'])
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'ignored_1.txt'))).toBe(true)
        expect(ignore.isIgnored(workspace1Root, path.join(workspace1Root, 'ignored_2.txt'))).toBe(false)
        expect(ignore.isIgnored(workspace2Root, path.join(workspace2Root, 'ignored_1.txt'))).toBe(false)
        expect(ignore.isIgnored(workspace2Root, path.join(workspace2Root, 'ignored_2.txt'))).toBe(true)
    })
})

import { describe, expect, it } from 'vitest'
import { fakeGitURLFromCodebase } from './git-metadata-for-editor'

describe('fakeGitURLFromCodebase', () => {
    it('returns undefined when codebaseName is undefined', () => {
        expect(fakeGitURLFromCodebase(undefined)).toBeUndefined()
    })

    it('returns the codebaseName as a URL string when it is a valid URL', () => {
        expect(fakeGitURLFromCodebase('https://github.com/sourcegraph/cody')).toBe(
            'https://github.com/sourcegraph/cody'
        )
    })

    it('converts a codebase name without a scheme to a git URL', () => {
        expect(fakeGitURLFromCodebase('example.com/foo/bar')).toBe('git@example.com:foo/bar')
    })

    it('handles a codebase name with multiple slashes', () => {
        expect(fakeGitURLFromCodebase('example.com/foo/bar/baz')).toBe('git@example.com:foo/bar/baz')
    })

    it('handles a codebase name with a single path component', () => {
        expect(fakeGitURLFromCodebase('example.com/foo')).toBe('git@example.com:foo')
    })
})

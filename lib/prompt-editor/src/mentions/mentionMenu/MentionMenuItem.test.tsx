import type { ContextItem, ContextItemRepository, ContextItemSymbol } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { getMentionItemTitleAndDisplayName } from './MentionMenuItem'

describe('getMentionItemTitleAndDisplayName', () => {
    it('should return correct title and displayName for a file', () => {
        const item: ContextItem = {
            type: 'file',
            uri: URI.parse('file:///path/to/testfile.ts'),
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'testfile.ts', displayName: 'testfile.ts' })
    })

    it('should use provided title if available', () => {
        const item: ContextItem = {
            type: 'file',
            uri: URI.parse('file:///path/to/file.ts'),
            title: 'Custom Title',
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'Custom Title', displayName: 'Custom Title' })
    })

    it('should return correct title and displayName for a class symbol', () => {
        const item: ContextItemSymbol = {
            type: 'symbol',
            symbolName: 'ClassSymbol',
            uri: URI.parse('file:///path/to/file.ts'),
            kind: 'class',
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'ClassSymbol', displayName: 'ClassSymbol' })
    })

    it('should return correct title and displayName for a method symbol', () => {
        const item: ContextItemSymbol = {
            type: 'symbol',
            symbolName: 'MethodSymbol',
            uri: URI.parse('file:///path/to/file.ts'),
            kind: 'method',
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'MethodSymbol', displayName: 'MethodSymbol' })
    })

    it('should return correct title and displayName for a repository', () => {
        const item: ContextItemRepository = {
            type: 'repository',
            title: 'host.com/org/repo',
            repoName: 'host.com/org/repo',
            repoID: 'host.com/org/repo',
            uri: URI.parse('https://host.com/org/repo'),
            content: null,
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'host.com/org/repo', displayName: 'org/repo' })
    })

    it('should handle repository with multiple slashes in title', () => {
        const item: ContextItemRepository = {
            type: 'repository',
            title: 'host.com/org/repo/sub/dir',
            repoName: 'host.com/org/repo/sub/dir',
            repoID: 'host.com/org/repo/sub/dir',
            uri: URI.parse('https://host.com/org/repo/sub/dir'),
            content: null,
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'host.com/org/repo/sub/dir', displayName: 'org/repo/sub/dir' })
    })

    it('should handle repository with a single slash in title', () => {
        const item: ContextItemRepository = {
            type: 'repository',
            title: 'org/repo',
            repoName: 'org/repo',
            repoID: 'repo',
            uri: URI.parse('https://host.org/repo'),
            content: null,
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'org/repo', displayName: 'repo' })
    })

    it('should handle repository without slash in title', () => {
        const item: ContextItemRepository = {
            type: 'repository',
            title: 'repo',
            repoName: 'repo',
            repoID: 'repo',
            uri: URI.parse('https://host.org/repo'),
            content: null,
        }
        const result = getMentionItemTitleAndDisplayName(item)
        expect(result).toEqual({ title: 'repo', displayName: 'repo' })
    })
})

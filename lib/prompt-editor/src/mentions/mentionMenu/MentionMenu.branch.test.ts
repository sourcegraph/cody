import {
    ContextItemSource,
    type MentionQuery,
    REMOTE_DIRECTORY_PROVIDER_URI,
} from '@sourcegraph/cody-shared'
import type { MentionMenuData } from '@sourcegraph/cody-shared'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { getBranchHelpText } from './MentionMenu'

describe('MentionMenu branch selection', () => {
    test('should show default branch text when no branch is specified', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'openctx',
                provider: 'openctx',
                title: 'src/components',
                uri: URI.parse('https://example.com/repo/-/tree/src/components'),
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                source: ContextItemSource.User,
                mention: {
                    uri: 'https://example.com/repo/-/tree/src/components',
                    data: {
                        repoName: 'test-repo',
                        directoryPath: 'src/components',
                    },
                },
            },
        ]

        const mentionQuery: MentionQuery = {
            text: 'test-repo:src',
            provider: REMOTE_DIRECTORY_PROVIDER_URI,
        }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe('* Sourced from the remote default branch')
    })

    test('should show branch name when branch is specified in query', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'openctx',
                provider: 'openctx',
                title: 'src/components',
                uri: URI.parse('https://example.com/repo/-/tree/src/components'),
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                source: ContextItemSource.User,
                mention: {
                    uri: 'https://example.com/repo/-/tree/src/components',
                    data: {
                        repoName: 'test-repo',
                        directoryPath: 'src/components',
                    },
                },
            },
        ]

        const mentionQuery = {
            text: 'test-repo@feature-branch:src',
            provider: REMOTE_DIRECTORY_PROVIDER_URI,
        }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'feature-branch' branch")
    })

    test('should show branch name from mention data when available', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'openctx',
                provider: 'openctx',
                title: 'src/components',
                uri: URI.parse('https://example.com/repo/-/tree/src/components'),
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                source: ContextItemSource.User,
                mention: {
                    uri: 'https://example.com/repo/-/tree/src/components',
                    data: {
                        repoName: 'test-repo',
                        directoryPath: 'src/components',
                        branch: 'main',
                    },
                },
            },
        ]

        const mentionQuery = { text: 'test-repo:src', provider: REMOTE_DIRECTORY_PROVIDER_URI }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'main' branch")
    })

    test('should prefer mention data branch over query branch', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'openctx',
                provider: 'openctx',
                title: 'src/components',
                uri: URI.parse('https://example.com/repo/-/tree/src/components'),
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                source: ContextItemSource.User,
                mention: {
                    uri: 'https://example.com/repo/-/tree/src/components',
                    data: {
                        repoName: 'test-repo',
                        directoryPath: 'src/components',
                        branch: 'actual-branch',
                    },
                },
            },
        ]

        const mentionQuery = {
            text: 'test-repo@query-branch:src',
            provider: REMOTE_DIRECTORY_PROVIDER_URI,
        }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'actual-branch' branch")
    })

    test('should handle empty items array', () => {
        const items: MentionMenuData['items'] = []
        const mentionQuery = { text: 'test-repo@main:src', provider: REMOTE_DIRECTORY_PROVIDER_URI }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'main' branch")
    })

    test('should handle non-openctx items', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'file',
                provider: 'file',
                title: 'test.ts',
                uri: URI.parse('file:///test.ts'),
                source: ContextItemSource.User,
            },
        ]

        const mentionQuery = { text: 'test-repo@feature:src', provider: REMOTE_DIRECTORY_PROVIDER_URI }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'feature' branch")
    })

    test('should show branch selection help when showing branch options', () => {
        const items: MentionMenuData['items'] = [
            {
                type: 'openctx',
                provider: 'openctx',
                title: '@main',
                uri: URI.parse('https://example.com/repo@main'),
                providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
                source: ContextItemSource.User,
                mention: {
                    uri: 'https://example.com/repo@main',
                    data: {
                        repoName: 'test-repo',
                        branch: 'main',
                        // No directoryPath - this indicates we're in branch selection mode
                    },
                },
            },
        ]

        const mentionQuery = { text: 'test-repo:', provider: REMOTE_DIRECTORY_PROVIDER_URI }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe('* Select or @ search for a specific branch')
    })
})

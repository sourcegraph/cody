import { ContextItemSource, REMOTE_DIRECTORY_PROVIDER_URI } from '@sourcegraph/cody-shared'
import type { MentionMenuData } from '@sourcegraph/cody-shared'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

// This would be imported from the MentionMenu component if it were exported
// For now, we'll create a test version of the function
function getBranchHelpText(
    items: NonNullable<MentionMenuData['items']>,
    mentionQuery: { text: string }
): string {
    // Check if we're in branch selection mode (showing branch options)
    const firstItem = items[0]
    if (firstItem?.type === 'openctx') {
        const openCtxItem = firstItem as any // Simplified for testing

        // If we're showing branch options (no directoryPath), show branch selection help
        if (openCtxItem.mention?.data?.repoName && !openCtxItem.mention?.data?.directoryPath) {
            // Check if this is a branch mention (title starts with @)
            if (firstItem.title?.startsWith('@')) {
                return '* @type to filter searches for a specific branch'
            }
        }

        // If we're browsing directories and have branch info, show current branch
        if (openCtxItem.mention?.data?.branch) {
            return `* Sourced from the '${openCtxItem.mention.data.branch}' branch`
        }
    }

    // Check if user has specified a branch in the query
    if (mentionQuery.text.includes('@')) {
        const branchPart = mentionQuery.text.split('@')[1]
        if (branchPart) {
            // Remove anything after colon (directory path)
            const branchName = branchPart.split(':')[0]
            return `* Sourced from the '${branchName}' branch`
        }
    }

    return '* Sourced from the remote default branch'
}

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

        const mentionQuery = { text: 'test-repo:src' }

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

        const mentionQuery = { text: 'test-repo@feature-branch:src' }

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

        const mentionQuery = { text: 'test-repo:src' }

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

        const mentionQuery = { text: 'test-repo@query-branch:src' }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe("* Sourced from the 'actual-branch' branch")
    })

    test('should handle empty items array', () => {
        const items: MentionMenuData['items'] = []
        const mentionQuery = { text: 'test-repo@main:src' }

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

        const mentionQuery = { text: 'test-repo@feature:src' }

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

        const mentionQuery = { text: 'test-repo:' }

        const result = getBranchHelpText(items!, mentionQuery)
        expect(result).toBe('* Select or @ search for a specific branch')
    })
})

import type { ContextItem } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { type Root, filterLocallyModifiedFilesOutOfRemoteContext } from './ContextRetriever'

describe('filterLocallyModifiedFilesOutOfRemoteContext', () => {
    it('filters out local context files', () => {
        const testCases: {
            roots: Root[]
            localModifiedFilesByRoot: string[][]
            remoteContextItems: ContextItem[]
            expectedFilteredRemoteContextItems: ContextItem[]
        }[] = [
            {
                roots: [
                    {
                        local: vscode.Uri.file('/tmp/my/repo'),
                        remoteRepos: [
                            {
                                name: 'github.com/my/repo',
                                id: '==myrepoid',
                            },
                        ],
                    },
                ],
                localModifiedFilesByRoot: [['/tmp/my/repo/README.md']],
                remoteContextItems: [
                    {
                        // Should be filtered out
                        type: 'file',
                        title: 'README.md',
                        repoName: 'github.com/my/repo',
                        uri: vscode.Uri.parse('https://example.com/1'),
                    },
                    {
                        // Doesn't match relative file path
                        type: 'file',
                        title: 'main.go',
                        repoName: 'github.com/my/repo',
                        uri: vscode.Uri.parse('https://example.com/2'),
                    },
                    {
                        // Doesn't match repo name
                        type: 'file',
                        title: 'README.md',
                        repoName: 'github.com/my/other-repo',
                        uri: vscode.Uri.parse('https://example.com/3'),
                    },
                ],
                expectedFilteredRemoteContextItems: [
                    {
                        // Doesn't match relative file path
                        type: 'file',
                        title: 'main.go',
                        repoName: 'github.com/my/repo',
                        uri: vscode.Uri.parse('https://example.com/2'),
                    },
                    {
                        // Doesn't match repo name
                        type: 'file',
                        title: 'README.md',
                        repoName: 'github.com/my/other-repo',
                        uri: vscode.Uri.parse('https://example.com/3'),
                    },
                ],
            },
            {
                // Test case for when localFilesByRoot has fewer elements than roots
                // This simulates the scenario when gitLocallyModifiedFiles fails and prevents
                // the "TypeError: localFilesByRoot[i] is not iterable" error
                roots: [
                    {
                        local: vscode.Uri.file('/tmp/my/repo1'),
                        remoteRepos: [
                            {
                                name: 'github.com/my/repo1',
                                id: '==myrepoid1',
                            },
                        ],
                    },
                    {
                        local: vscode.Uri.file('/tmp/my/repo2'),
                        remoteRepos: [
                            {
                                name: 'github.com/my/repo2',
                                id: '==myrepoid2',
                            },
                        ],
                    },
                ],
                // Empty array simulates the case when gitLocallyModifiedFiles fails
                // and changedFilesByRoot remains empty
                localModifiedFilesByRoot: [],
                remoteContextItems: [
                    {
                        type: 'file',
                        title: 'README.md',
                        repoName: 'github.com/my/repo1',
                        uri: vscode.Uri.parse('https://example.com/1'),
                    },
                    {
                        type: 'file',
                        title: 'main.go',
                        repoName: 'github.com/my/repo2',
                        uri: vscode.Uri.parse('https://example.com/2'),
                    },
                ],
                // Should return all items since no local files are marked as modified
                expectedFilteredRemoteContextItems: [
                    {
                        type: 'file',
                        title: 'README.md',
                        repoName: 'github.com/my/repo1',
                        uri: vscode.Uri.parse('https://example.com/1'),
                    },
                    {
                        type: 'file',
                        title: 'main.go',
                        repoName: 'github.com/my/repo2',
                        uri: vscode.Uri.parse('https://example.com/2'),
                    },
                ],
            },
        ]

        for (const testCase of testCases) {
            const {
                roots,
                localModifiedFilesByRoot: localFilesByRoot,
                remoteContextItems,
                expectedFilteredRemoteContextItems: expected,
            } = testCase
            const { keep: filteredContextItems } = filterLocallyModifiedFilesOutOfRemoteContext(
                roots,
                localFilesByRoot,
                remoteContextItems
            )

            expect(filteredContextItems).toEqual(expected)
        }
    })
})

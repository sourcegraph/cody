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

import { ContextItemSource } from '@sourcegraph/cody-shared'
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import type { Repository } from '../../repository/builtinGitExtension'
import { doesFileExist } from '../utils/workspace-files'
import { getContextFilesFromGitDiff } from './git-api'

vi.mock('../repository')
vi.mock('../utils')
vi.mock('../utils/workspace-files', () => ({
    doesFileExist: vi.fn(),
}))

describe('getContextFilesFromGitDiff', () => {
    const mockGitRepo = {
        diffIndexWithHEAD: vi.fn(),
        diffWithHEAD: vi.fn(),
        diff: vi.fn(),
    } as unknown as Repository

    const diffIndexWithHEAD = mockGitRepo.diffIndexWithHEAD as Mock
    const diffWithHEAD = mockGitRepo.diffWithHEAD as Mock
    const diff = mockGitRepo.diff as Mock
    const mockDoesFileExist = doesFileExist as Mock

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should return diffs for staged changes', async () => {
        diffIndexWithHEAD.mockResolvedValue([{ uri: URI.parse('file:///path/file1.ts') }])
        diffWithHEAD.mockResolvedValue([])
        diff.mockResolvedValue(
            'diff --git a/file1.ts b/file1.ts\n' +
                '--- a/file1.ts\n' +
                '+++ b/file1.ts\n' +
                '@@ -1,1 +1,2 @@\n' +
                '+console.log("Hello World");\n'
        )

        mockDoesFileExist.mockResolvedValue(true)

        const result = await getContextFilesFromGitDiff(mockGitRepo)

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            type: 'file',
            title: 'git diff --cached',
            uri: URI.parse('file:///path/file1.ts'),
            source: ContextItemSource.Terminal,
        })
    })

    it('should return diffs for unstaged changes when no staged changes', async () => {
        diffIndexWithHEAD.mockResolvedValue([])
        diffWithHEAD.mockResolvedValue([{ uri: URI.parse('file:///path/to/file2.ts') }])
        diff.mockResolvedValue(
            'diff --git a/file2.ts b/file2.ts\n' +
                '--- a/file2.ts\n' +
                '+++ b/file2.ts\n' +
                '@@ -1,1 +1,2 @@\n' +
                '+console.log("Unstaged change");\n'
        )

        mockDoesFileExist.mockResolvedValue(true)

        const result = await getContextFilesFromGitDiff(mockGitRepo)

        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            type: 'file',
            title: 'git diff',
            uri: URI.parse('file:///path/to/file2.ts'),
            source: ContextItemSource.Terminal,
        })
    })

    it('should throw error if diff output is empty', async () => {
        diffIndexWithHEAD.mockResolvedValue([])
        diffWithHEAD.mockResolvedValue([])
        diff.mockResolvedValue('')

        await expect(getContextFilesFromGitDiff(mockGitRepo)).rejects.toThrow('Failed to get git diff.')
    })

    it('should handle multiple files in diffs', async () => {
        diffIndexWithHEAD.mockResolvedValue([
            { uri: URI.parse('file:///path/to/file1.ts') },
            { uri: URI.parse('file:///path/to/file2.ts') },
        ])
        diffWithHEAD.mockResolvedValue([])
        diff.mockResolvedValue(
            'diff --git a/file1.ts b/file1.ts\n' +
                '--- a/file1.ts\n' +
                '+++ b/file1.ts\n' +
                '@@ -1,1 +1,2 @@\n' +
                '+console.log("File 1");\n' +
                'diff --git a/file2.ts b/file2.ts\n' +
                '--- a/file2.ts\n' +
                '+++ b/file2.ts\n' +
                '@@ -1,1 +1,2 @@\n' +
                '+console.log("File 2");\n'
        )

        mockDoesFileExist.mockResolvedValue(true)
        const result = await getContextFilesFromGitDiff(mockGitRepo)
        expect(result).toHaveLength(2)
    })

    it('should skip files that do not exist', async () => {
        diffIndexWithHEAD.mockResolvedValue([{ uri: URI.parse('file:///path/to/nonexistent.ts') }])
        diffWithHEAD.mockResolvedValue([])
        diff.mockResolvedValue(
            'diff --git a/nonexistent.ts b/nonexistent.ts\n' +
                '--- a/nonexistent.ts\n' +
                '+++ b/nonexistent.ts\n' +
                '@@ -0,0 +1 @@\n' +
                '+This file does not exist\n'
        )

        mockDoesFileExist.mockResolvedValue(false)
        await expect(getContextFilesFromGitDiff(mockGitRepo)).rejects.toThrow('Failed to get git diff.')
    })

    it('should handle Windows OS paths', async () => {
        diffIndexWithHEAD.mockResolvedValue([{ uri: URI.parse('file:///c:/path/to/file3.ts') }])
        diffWithHEAD.mockResolvedValue([])
        diff.mockResolvedValue(
            'diff --git a/path/to/file3.ts b/path/to/file3.ts\n' +
                '--- a/file3.ts\n' +
                '+++ b/file3.ts\n' +
                '@@ -1,1 +1,2 @@\n' +
                '+console.log("Windows path");\n'
        )

        // Windows path
        vi.mock('../../utils/path-utils', () => ({
            displayPath: vi.fn().mockReturnValue('path\\to\\file3.ts'),
        }))

        mockDoesFileExist.mockResolvedValue(true)
        const result = await getContextFilesFromGitDiff(mockGitRepo)
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({
            type: 'file',
            title: 'git diff --cached',
            uri: URI.parse('file:///c:/path/to/file3.ts'),
            source: ContextItemSource.Terminal,
        })
    })
})

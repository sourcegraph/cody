import { describe, expect, it, vi } from 'vitest'

// Mock vscode.workspace.fs
vi.mock('vscode', () => ({
    workspace: {
        fs: {
            readFile: vi.fn(),
        },
        workspaceFolders: vi.fn(),
        findFiles: vi.fn(),
        getConfiguration: vi.fn(),
    },
    Uri: {
        file: vi.fn((path: string) => ({ toString: () => `file://${path}` })),
        joinPath: vi.fn(),
    },
    RelativePattern: vi.fn(),
}))

import * as vscode from 'vscode'
import { findWorkspaceFiles, readIgnoreFile } from './findWorkspaceFiles'

describe('readIgnoreFile', () => {
    it('parses basic gitignore patterns', async () => {
        const mockData = new Uint8Array(Buffer.from('node_modules\n*.log\n.env'))
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/node_modules': true,
            '**/*.log': true,
            '**/.env': true,
        })
    })

    it('handles comments and empty lines', async () => {
        const mockData = new Uint8Array(
            Buffer.from('# Comment\nnode_modules\n\n*.log # inline comment\n')
        )
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/node_modules': true,
            '**/*.log': true,
        })
    })

    it('ignores negation patterns', async () => {
        const mockData = new Uint8Array(Buffer.from('*.log\n!important.log\nnode_modules'))
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/*.log': true,
            '**/node_modules': true,
        })
    })

    it('handles directory patterns', async () => {
        const mockData = new Uint8Array(Buffer.from('dist/\n/root_only\n**/deep_pattern'))
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/dist': true,
            '/root_only': true,
            '**/deep_pattern': true,
        })
    })

    it('replaces commas with dots to fix common typos', async () => {
        const mockData = new Uint8Array(
            Buffer.from('node_modules\n*,something\n*.log\n*,js\nvalid_pattern')
        )
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/node_modules': true,
            '**/*.something': true,
            '**/*.log': true,
            '**/*.js': true,
            '**/valid_pattern': true,
        })
    })

    it('handles file read errors gracefully', async () => {
        vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('File not found'))

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({})
    })

    it('handles whitespace and trailing slashes', async () => {
        const mockData = new Uint8Array(Buffer.from('  node_modules  \ndist/   \n  *.log  # comment  '))
        vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(mockData)

        const result = await readIgnoreFile({} as vscode.Uri)

        expect(result).toEqual({
            '**/node_modules': true,
            '**/dist': true,
            '**/*.log': true,
        })
    })
})

describe('findWorkspaceFiles', () => {
    it('deduplicates files when workspace folders overlap', async () => {
        // Mock workspace folders with parent and child relationship
        const parentFolder = { uri: { toString: () => 'file:///project' } }
        const childFolder = { uri: { toString: () => 'file:///project/src/addons' } }

        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [parentFolder, childFolder],
            configurable: true,
        })

        // Mock getConfiguration to return empty exclude patterns
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockReturnValue({}),
        } as any)

        // Create mock URIs for files that would be found in both folders
        const sharedFile1 = { toString: () => 'file:///project/src/addons/Edit.jsx' }
        const sharedFile2 = { toString: () => 'file:///project/src/addons/components/Button.tsx' }
        const parentOnlyFile = { toString: () => 'file:///project/package.json' }

        // Mock findFiles to return overlapping results
        vi.mocked(vscode.workspace.findFiles)
            .mockResolvedValueOnce([
                // Parent folder finds all files including those in addons
                parentOnlyFile as any,
                sharedFile1 as any,
                sharedFile2 as any,
            ])
            .mockResolvedValueOnce([
                // Child folder finds only files in addons (duplicates)
                sharedFile1 as any,
                sharedFile2 as any,
            ])

        const result = await findWorkspaceFiles()

        // Should deduplicate and return only unique files
        expect(result).toHaveLength(3)
        expect(result.map(uri => uri.toString())).toEqual([
            'file:///project/package.json',
            'file:///project/src/addons/Edit.jsx',
            'file:///project/src/addons/components/Button.tsx',
        ])
    })

    it('handles no workspace folders gracefully', async () => {
        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: null,
            configurable: true,
        })
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockReturnValue({}),
        } as any)
        vi.mocked(vscode.workspace.findFiles).mockResolvedValueOnce([])

        const result = await findWorkspaceFiles()

        expect(result).toEqual([])
    })

    it('returns files without deduplication when no overlaps exist', async () => {
        const folder1 = { uri: { toString: () => 'file:///project1' } }
        const folder2 = { uri: { toString: () => 'file:///project2' } }

        Object.defineProperty(vscode.workspace, 'workspaceFolders', {
            value: [folder1, folder2],
            configurable: true,
        })

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn().mockReturnValue({}),
        } as any)

        const file1 = { toString: () => 'file:///project1/file1.js' }
        const file2 = { toString: () => 'file:///project2/file2.js' }

        vi.mocked(vscode.workspace.findFiles)
            .mockResolvedValueOnce([file1 as any])
            .mockResolvedValueOnce([file2 as any])

        const result = await findWorkspaceFiles()

        expect(result).toHaveLength(2)
        expect(result.map(uri => uri.toString())).toEqual([
            'file:///project1/file1.js',
            'file:///project2/file2.js',
        ])
    })
})
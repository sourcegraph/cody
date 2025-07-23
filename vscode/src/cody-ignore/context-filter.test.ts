import { describe, expect, it, vi } from 'vitest'

// Mock vscode.workspace.fs
vi.mock('vscode', () => ({
    workspace: {
        fs: {
            readFile: vi.fn(),
        },
    },
    Uri: {
        file: vi.fn(),
    },
}))

import * as vscode from 'vscode'
import { readIgnoreFile } from './context-filter'

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

import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { doesFileExist } from '../../commands/utils/workspace-files'
import { resolveRelativeOrAbsoluteUri, smartJoinPath } from './edit-create-file'

vi.mock('../../commands/utils/workspace-files', () => ({
    doesFileExist: vi.fn(),
}))

function toUri(...paths: string[]) {
    return vscode.Uri.file(path.join(...paths))
}

describe('resolveRelativeOrAbsoluteUri', () => {
    const mockActiveEditorUri = toUri('/', 'mock', 'active', 'editor.ts')
    const mockBaseDirUri = toUri('/', 'mock', 'base', 'dir')

    beforeEach(() => {
        vi.mocked(doesFileExist).mockResolvedValue(false)
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('returns fallback URI when no URI is provided', async () => {
        const result = await resolveRelativeOrAbsoluteUri(undefined, undefined, mockActiveEditorUri)
        expect(result).toEqual(mockActiveEditorUri)
    })

    it('returns file URI when root directory exists', async () => {
        vi.mocked(doesFileExist).mockResolvedValue(true)
        const uri = toUri(path.sep, 'existing', 'file.ts')
        const result = await resolveRelativeOrAbsoluteUri(undefined, uri.path, mockActiveEditorUri)
        expect(result).toEqual(uri)
    })

    it('joins URI with base directory when root does not exist', async () => {
        const uri = toUri('relative', 'file.ts')
        const result = await resolveRelativeOrAbsoluteUri(mockBaseDirUri, uri.path)
        expect(result).toEqual(toUri(path.sep, 'mock', 'base', 'dir', 'relative', 'file.ts'))
    })

    it('returns fallback URI when no base directory is provided and root does not exist', async () => {
        const uri = toUri('non', 'existing', 'file.ts')
        const result = await resolveRelativeOrAbsoluteUri(undefined, uri.path, mockActiveEditorUri)
        expect(result).toEqual(mockActiveEditorUri)
    })
})

describe('smartJoinPath', () => {
    it('joins paths correctly when no common parts', () => {
        const baseDirUri = toUri(path.sep, 'base', 'dir')
        const relativeFileUri = 'file.ts'
        const result = smartJoinPath(baseDirUri, relativeFileUri)
        expect(result).toEqual(toUri(path.sep, 'base', 'dir', 'file.ts'))
    })

    it('joins paths correctly with common parts', () => {
        const baseDirUri = toUri(path.sep, 'common', 'base', 'dir')
        const relativeFileUri = toUri('base', 'dir', 'file.ts')
        const result = smartJoinPath(baseDirUri, relativeFileUri.path)
        expect(result).toEqual(toUri(path.sep, 'common', 'base', 'dir', 'file.ts'))
    })

    it('handles complex relative paths', () => {
        const baseDirUri = toUri(path.sep, 'root', 'project')
        const relativeFileUri = toUri('..', 'sibling', 'folder', 'file.ts')
        const result = smartJoinPath(baseDirUri, relativeFileUri.path)
        expect(result).toEqual(toUri(path.sep, 'root', 'sibling', 'folder', 'file.ts'))
    })
})

import { describe, expect, it, vi } from 'vitest'
import { Uri, workspace } from 'vscode'
import { PROMPT_TOPICS } from './prompt/constants'
import { deriveNewFileUri } from './provider'

// Mock the necessary vscode and utility functions
vi.mock('vscode', () => ({
    Uri: {
        parse: vi.fn().mockImplementation((path: string) => ({ path })),
    },
    workspace: {
        getWorkspaceFolder: vi.fn(),
    },
}))

vi.mock('vscode-uri', () => ({
    Utils: {
        joinPath: vi
            .fn()
            .mockImplementation((base: Uri, path: string) => ({ path: `${base.path}/${path}` })),
    },
}))

describe('deriveNewFileUri', () => {
    it('should derive new file URI with workspace URI', () => {
        const currentFileUri = Uri.parse('/workspace/project/file.txt')
        const text = `<${PROMPT_TOPICS.FILENAME}>newfile.txt</${PROMPT_TOPICS.FILENAME}>`
        const workspaceUri = Uri.parse('/workspace')

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue({
            uri: workspaceUri,
            name: 'workspace',
            index: 0,
        })
        const result = deriveNewFileUri(currentFileUri, text)

        expect(result.path).toBe('/workspace/newfile.txt')
    })

    it('should derive new file URI with current directory URI', () => {
        const currentFileUri = Uri.parse('/workspace/project/file.txt')
        const text = `<${PROMPT_TOPICS.FILENAME}>newfile.txt</${PROMPT_TOPICS.FILENAME}>`

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(undefined)

        const result = deriveNewFileUri(currentFileUri, text)

        expect(result.path).toBe('/workspace/project/newfile.txt')
    })

    it('should handle text without tags correctly', () => {
        const currentFileUri = Uri.parse('/workspace/project/file.txt')
        const text = 'newfile.txt'

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(undefined)

        const result = deriveNewFileUri(currentFileUri, text)

        expect(result.path).toBe('/workspace/project/newfile.txt')
    })

    it('should derive new file URI with specific workspace path', () => {
        const currentFileUri = Uri.parse('c:/Users/mikko/IdeaProjects/cody/vscode/src/edit/provider.ts')
        const text = `<${PROMPT_TOPICS.FILENAME}>provider.test.ts</${PROMPT_TOPICS.FILENAME}>`
        const workspaceUri = Uri.parse('/Users/mikko/IdeaProjects/cody/')

        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue({
            uri: workspaceUri,
            name: 'cody',
            index: 0,
        })
        const result = deriveNewFileUri(currentFileUri, text)

        expect(result.path).toBe('/Users/mikko/IdeaProjects/cody/vscode/src/edit/provider.test.ts')
    })
})

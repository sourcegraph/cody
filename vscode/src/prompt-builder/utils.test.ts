import {
    type ContextItem,
    type ContextItemFile,
    ContextItemSource,
    type MessagePart,
    UIToolStatus,
    ps,
} from '@sourcegraph/cody-shared'
import type { ContextItemToolState } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { renderContextItem } from './utils'

describe('renderContextItem', () => {
    // Helper function to create a basic file context item
    const createFileContextItem = (overrides: Partial<ContextItemFile> = {}): ContextItemFile => ({
        type: 'file',
        uri: URI.file('/path/to/file.ts'),
        content: 'const example = "test";',
        ...overrides,
    })

    it('returns null for undefined content', () => {
        const contextItem = createFileContextItem({ content: undefined })
        expect(renderContextItem(contextItem)).toBeNull()
    })

    it('returns null for empty content unless explicitly requested in chat input', () => {
        // Empty content not in chat input should return null
        const emptyContentItem = createFileContextItem({ content: '' })
        expect(renderContextItem(emptyContentItem)).toBeNull()

        // Empty content with whitespace not in chat input should return null
        const whitespaceContentItem = createFileContextItem({ content: '   \n  ' })
        expect(renderContextItem(whitespaceContentItem)).toBeNull()

        // Empty content but explicitly requested in chat input should not return null
        const userRequestedEmptyItem = createFileContextItem({
            content: '',
            source: ContextItemSource.User,
        })
        expect(renderContextItem(userRequestedEmptyItem)).not.toBeNull()

        const initialRequestedEmptyItem = createFileContextItem({
            content: '',
            source: ContextItemSource.Initial,
        })
        expect(renderContextItem(initialRequestedEmptyItem)).not.toBeNull()
    })

    it('handles media type context items correctly', () => {
        const mediaItem: ContextItem = {
            type: 'media',
            uri: URI.file('/path/to/image.png'),
            content: 'image data',
            data: 'data:image/png;base64,iVBORw0KGgoAAAA==',
            mimeType: 'image/png',
            filename: 'image.png',
            source: ContextItemSource.User,
        }

        const result = renderContextItem(mediaItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        expect(result?.text).toEqual(ps``)
        expect(result?.file).toBe(mediaItem)
        expect(result?.content).toEqual([
            {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAA==' },
            },
        ])
    })

    it('handles Selection source correctly', () => {
        const range = {
            start: { line: 1, character: 0 },
            end: { line: 5, character: 10 },
        }
        const selectionItem = createFileContextItem({
            source: ContextItemSource.Selection,
            range,
        })

        const result = renderContextItem(selectionItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // We don't test the exact text content since populateCurrentSelectedCodeContextTemplate
        // is an imported function that we're not testing directly
        expect(result?.text).toBeDefined()
        expect(result?.file).toBe(selectionItem)
    })

    it('handles Editor source correctly', () => {
        const editorItem = createFileContextItem({
            source: ContextItemSource.Editor,
        })

        const result = renderContextItem(editorItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // The text should contain the display path
        expect(result?.text.toString()).toContain('file.ts')
        expect(result?.file).toBe(editorItem)
    })

    it('handles Terminal source correctly', () => {
        // For Terminal source, content should be a string not a PromptString
        const terminalContent = 'npm install --save-dev vitest'
        const terminalItem = createFileContextItem({
            source: ContextItemSource.Terminal,
            content: terminalContent,
        })

        const result = renderContextItem(terminalItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // The content is converted to a PromptString by fromContextItem
        expect(result?.text?.toString()).toBe(terminalContent)
        expect(result?.file).toBe(terminalItem)
    })

    it('handles History source correctly', () => {
        // For History source, content should be a string not a PromptString
        const historyContent = 'git commit -m "Add new feature"'
        const historyItem = createFileContextItem({
            source: ContextItemSource.History,
            content: historyContent,
        })

        const result = renderContextItem(historyItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // The content is converted to a PromptString by fromContextItem
        expect(result?.text?.toString()).toBe(historyContent)
        expect(result?.file).toBe(historyItem)
    })

    it('handles openctx type correctly', () => {
        const openctxItem: ContextItem = {
            type: 'openctx',
            uri: URI.file('/path/to/openctx'),
            title: 'OpenCtx Title',
            content: 'OpenCtx Content',
            provider: 'openctx',
            providerUri: 'provider-uri',
        }

        const result = renderContextItem(openctxItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // Should contain the title and display path
        expect(result?.text.toString()).toContain('OpenCtx Title')
        expect(result?.text.toString()).toContain('openctx')
        expect(result?.file).toBe(openctxItem)
    })

    it('handles tool-state type correctly', () => {
        const toolStateParts: MessagePart[] = [
            {
                type: 'text',
                text: 'Tool state content',
            },
        ]

        const toolStateItem: ContextItemToolState = {
            type: 'tool-state',
            uri: URI.file('/path/to/tool-state'),
            content: 'Tool state content',
            toolId: 'tool-123',
            toolName: 'Test Tool',
            status: UIToolStatus.Done,
            outputType: 'terminal-output',
            parts: toolStateParts,
            source: ContextItemSource.Agentic, // Adding source to ensure it's processed
        }

        const result = renderContextItem(toolStateItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        expect(result?.text?.toString()).toBe('')
        expect(result?.content).toBe(toolStateParts)
        expect(result?.file).toBe(toolStateItem)
    })

    it('handles default case correctly for file type', () => {
        const fileItem = createFileContextItem({
            source: ContextItemSource.Search,
            repoName: 'example-repo',
        })

        const result = renderContextItem(fileItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        // We don't test the exact text content since populateCodeContextTemplate
        // is an imported function that we're not testing directly
        expect(result?.text).toBeDefined()
        expect(result?.file).toBe(fileItem)
    })

    it('handles Unified source correctly', () => {
        const unifiedItem = createFileContextItem({
            source: ContextItemSource.Unified,
            title: '/path/to/unified',
        })

        const result = renderContextItem(unifiedItem)
        expect(result).not.toBeNull()
        expect(result?.speaker).toBe('human')
        expect(result?.text).toBeDefined()
        expect(result?.file).toBe(unifiedItem)
    })
})

import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import type { ContextItem, Editor } from '@sourcegraph/cody-shared'

import '../../testutils/vscode'

import { contextFilesToContextItems } from './SimpleChatPanelProvider'

describe('contextFilesToContextItems', () => {
    test('omits files that could not be read', async () => {
        // Fixes https://github.com/sourcegraph/cody/issues/2390.
        const mockEditor: Partial<Editor> = {
            getTextEditorContentForFile(uri) {
                if (uri.path === '/a.txt') {
                    return Promise.resolve('a')
                }
                throw new Error('error')
            },
        }
        const contextItems = await contextFilesToContextItems(
            mockEditor as Editor,
            [
                {
                    type: 'file',
                    uri: URI.parse('file:///a.txt'),
                },
                {
                    type: 'file',
                    uri: URI.parse('file:///error.txt'),
                },
            ],
            true
        )
        expect(contextItems).toEqual<ContextItem[]>([
            { type: 'file', uri: URI.parse('file:///a.txt'), content: 'a' },
        ])
    })
})

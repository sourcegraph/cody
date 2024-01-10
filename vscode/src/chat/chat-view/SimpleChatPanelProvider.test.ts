import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { type Editor } from '@sourcegraph/cody-shared/src/editor'

import { type ContextItem } from './SimpleChatModel'
import { contextFilesToContextItems } from './SimpleChatPanelProvider'

import '../../testutils/vscode'

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
        expect(contextItems).toEqual<ContextItem[]>([{ uri: URI.parse('file:///a.txt'), text: 'a' }])
    })
})

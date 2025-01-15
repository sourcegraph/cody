import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from './atMentionsSerializer'
import type { SerializedPromptEditorValue } from './editorState'

describe('atMentionsSerializer', () => {
    const mockInputData: SerializedPromptEditorValue = {
        text: 'test web/demo hello .nvmrc test',
        contextItems: [
            {
                type: 'openctx',
                provider: 'openctx',
                title: 'web/demo',
                uri: 'file:///github.com/sourcegraph/cody/web/demo/',
                providerUri: 'internal-remote-directory-search',
                description: 'Current Directory',
                // @ts-ignore
                source: 'initial',
                // @ts-ignore
                mention: {
                    data: {
                        repoName: 'github.com/sourcegraph/cody',
                        repoID: 'UmVwb3NpdG9yeToyNzU5OQ==',
                        directoryPath: 'web/demo/',
                    },
                    description: 'web/demo',
                },
            },
            {
                type: 'openctx',
                uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                title: '.nvmrc',
                providerUri: 'internal-remote-file-search',
                provider: 'openctx',
                mention: {
                    uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                    data: {
                        repoName: 'github.com/microsoft/vscode',
                        rev: '99bcf08774784dedbb5e19b5ee332e7169a7159d',
                        filePath: '.nvmrc',
                    },
                    description: '.nvmrc',
                },
                // @ts-ignore
                source: 'user',
            },
        ],
        editorState: {
            v: 'lexical-v1',
            minReaderV: 'lexical-v1',
            lexicalEditorState: {
                root: {
                    type: 'root',
                    children: [
                        {
                            type: 'paragraph',
                            // @ts-ignore
                            children: [
                                {
                                    type: 'text',
                                    text: 'test ',
                                    detail: 0,
                                    format: 0,
                                    mode: 'normal',
                                    style: '',
                                    version: 1,
                                },
                            ],
                            direction: 'ltr',
                            format: '',
                            indent: 0,
                            version: 1,
                            textStyle: '',
                            textFormat: 0,
                        },
                    ],
                    format: '',
                    indent: 0,
                    version: 1,
                    direction: 'ltr',
                },
            },
        },
    }

    describe('serialize', () => {
        it('should serialize data with correct prefix', () => {
            const result = serialize(mockInputData)
            expect(result.startsWith('cody://serialized.v1?data=')).toBe(true)
        })

        it('should produce a string that can be deserialized back to original data', () => {
            const serialized = serialize(mockInputData)
            const deserialized = deserialize(serialized)
            expect(deserialized).toMatchObject(mockInputData)
        })
    })

    describe('deserialize', () => {
        it('should return undefined for invalid prefix', () => {
            const result = deserialize('invalid://prefix')
            expect(result).toBeUndefined()
        })

        it('should correctly deserialize valid data', () => {
            const serialized = serialize(mockInputData)
            const result = deserialize(serialized)
            expect(result).toMatchObject(mockInputData)
        })
    })
})

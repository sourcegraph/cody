import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from './atMentionsSerializer'
import type { SerializedPromptEditorValue } from './editorState'

describe('atMentionsSerializer', () => {
    it('serializes and deserializes editor state with unicode characters correctly', () => {
        const input = {
            text: 'test 🚀 hello 🎮 test',
            contextItems: [
                {
                    type: 'openctx',
                    provider: 'openctx',
                    title: '🚀',
                    uri: 'file:///github.com/sourcegraph/cody/web/demo/',
                    providerUri: 'internal-remote-directory-search',
                    description: 'Current Directory',
                    source: 'initial',
                    mention: {
                        data: {
                            repoName: 'github.com/sourcegraph/cody',
                            repoID: 'UmVwb3NpdG9yeToyNzU5OQ==',
                            directoryPath: 'web/demo/',
                        },
                        description: '🚀',
                    },
                },
                {
                    type: 'openctx',
                    uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                    title: '🎮',
                    providerUri: 'internal-remote-file-search',
                    provider: 'openctx',
                    mention: {
                        uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                        data: {
                            repoName: 'github.com/microsoft/vscode',
                            rev: '99bcf08774784dedbb5e19b5ee332e7169a7159d',
                            filePath: '.nvmrc',
                        },
                        description: '🎮',
                    },
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
                                    {
                                        type: 'contextItemMention',
                                        text: '🚀',
                                        contextItem: {
                                            type: 'openctx',
                                            provider: 'openctx',
                                            title: '🚀',
                                            uri: 'file:///github.com/sourcegraph/cody/web/demo/',
                                            providerUri: 'internal-remote-directory-search',
                                            description: 'Current Directory',
                                            source: 'initial',
                                            mention: {
                                                data: {
                                                    repoName: 'github.com/sourcegraph/cody',
                                                    repoID: 'UmVwb3NpdG9yeToyNzU5OQ==',
                                                    directoryPath: 'web/demo/',
                                                },
                                                description: '🚀',
                                            },
                                        },
                                        isFromInitialContext: false,
                                        version: 1,
                                    },
                                    {
                                        type: 'text',
                                        text: ' hello ',
                                        detail: 0,
                                        format: 0,
                                        mode: 'normal',
                                        style: '',
                                        version: 1,
                                    },
                                    {
                                        type: 'contextItemMention',
                                        text: '🎮',
                                        contextItem: {
                                            type: 'openctx',
                                            uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                                            title: '🎮',
                                            providerUri: 'internal-remote-file-search',
                                            provider: 'openctx',
                                            mention: {
                                                uri: 'https://sourcegraph.sourcegraph.com/github.com/microsoft/vscode/-/blob/.nvmrc',
                                                data: {
                                                    repoName: 'github.com/microsoft/vscode',
                                                    rev: '99bcf08774784dedbb5e19b5ee332e7169a7159d',
                                                    filePath: '.nvmrc',
                                                },
                                                description: '🎮',
                                            },
                                            source: 'user',
                                        },
                                        isFromInitialContext: false,
                                        version: 1,
                                    },
                                    {
                                        type: 'text',
                                        text: ' test',
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

        const serialized = serialize(input as SerializedPromptEditorValue)
        const deserialized = deserialize(serialized)

        // Verify the round trip
        expect(deserialized).toBeDefined()
        expect(serialized).toContain(
            'cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmNvbnRleHRJdGVtTWVudGlvbiUyMiUyQyUyMnRleHQlMjIlM0ElMjIlRjAlOUYlOUElODAlMjIlMkMlMjJjb250ZXh0SXRlbSUyMiUzQSU3QiUyMnR5cGUlMjIlM0ElMjJvcGVuY3R4JTIyJTJDJTIycHJvdmlkZXIlMjIlM0ElMjJvcGVuY3R4JTIyJTJDJTIydGl0bGUlMjIlM0ElMjIlRjAlOUYlOUElODAlMjIlMkMlMjJ1cmklMjIlM0ElMjJmaWxlJTNBJTJGJTJGJTJGZ2l0aHViLmNvbSUyRnNvdXJjZWdyYXBoJTJGY29keSUyRndlYiUyRmRlbW8lMkYlMjIlMkMlMjJwcm92aWRlclVyaSUyMiUzQSUyMmludGVybmFsLXJlbW90ZS1kaXJlY3Rvcnktc2VhcmNoJTIyJTJDJTIyZGVzY3JpcHRpb24lMjIlM0ElMjJDdXJyZW50JTIwRGlyZWN0b3J5JTIyJTJDJTIyc291cmNlJTIyJTNBJTIyaW5pdGlhbCUyMiUyQyUyMm1lbnRpb24lMjIlM0ElN0IlMjJkYXRhJTIyJTNBJTdCJTIycmVwb05hbWUlMjIlM0ElMjJnaXRodWIuY29tJTJGc291cmNlZ3JhcGglMkZjb2R5JTIyJTJDJTIycmVwb0lEJTIyJTNBJTIyVW1Wd2IzTnBkRzl5ZVRveU56VTVPUSUzRCUzRCUyMiUyQyUyMmRpcmVjdG9yeVBhdGglMjIlM0ElMjJ3ZWIlMkZkZW1vJTJGJTIyJTdEJTJDJTIyZGVzY3JpcHRpb24lMjIlM0ElMjIlRjAlOUYlOUElODAlMjIlN0QlN0QlMkMlMjJpc0Zyb21Jbml0aWFsQ29udGV4dCUyMiUzQWZhbHNlJTJDJTIydmVyc2lvbiUyMiUzQTElN0Q=_'
        )
        expect(serialized).toContain(
            'cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmNvbnRleHRJdGVtTWVudGlvbiUyMiUyQyUyMnRleHQlMjIlM0ElMjIlRjAlOUYlOEUlQUUlMjIlMkMlMjJjb250ZXh0SXRlbSUyMiUzQSU3QiUyMnR5cGUlMjIlM0ElMjJvcGVuY3R4JTIyJTJDJTIydXJpJTIyJTNBJTIyaHR0cHMlM0ElMkYlMkZzb3VyY2VncmFwaC5zb3VyY2VncmFwaC5jb20lMkZnaXRodWIuY29tJTJGbWljcm9zb2Z0JTJGdnNjb2RlJTJGLSUyRmJsb2IlMkYubnZtcmMlMjIlMkMlMjJ0aXRsZSUyMiUzQSUyMiVGMCU5RiU4RSVBRSUyMiUyQyUyMnByb3ZpZGVyVXJpJTIyJTNBJTIyaW50ZXJuYWwtcmVtb3RlLWZpbGUtc2VhcmNoJTIyJTJDJTIycHJvdmlkZXIlMjIlM0ElMjJvcGVuY3R4JTIyJTJDJTIybWVudGlvbiUyMiUzQSU3QiUyMnVyaSUyMiUzQSUyMmh0dHBzJTNBJTJGJTJGc291cmNlZ3JhcGguc291cmNlZ3JhcGguY29tJTJGZ2l0aHViLmNvbSUyRm1pY3Jvc29mdCUyRnZzY29kZSUyRi0lMkZibG9iJTJGLm52bXJjJTIyJTJDJTIyZGF0YSUyMiUzQSU3QiUyMnJlcG9OYW1lJTIyJTNBJTIyZ2l0aHViLmNvbSUyRm1pY3Jvc29mdCUyRnZzY29kZSUyMiUyQyUyMnJldiUyMiUzQSUyMjk5YmNmMDg3NzQ3ODRkZWRiYjVlMTliNWVlMzMyZTcxNjlhNzE1OWQlMjIlMkMlMjJmaWxlUGF0aCUyMiUzQSUyMi5udm1yYyUyMiU3RCUyQyUyMmRlc2NyaXB0aW9uJTIyJTNBJTIyJUYwJTlGJThFJUFFJTIyJTdEJTJDJTIyc291cmNlJTIyJTNBJTIydXNlciUyMiU3RCUyQyUyMmlzRnJvbUluaXRpYWxDb250ZXh0JTIyJTNBZmFsc2UlMkMlMjJ2ZXJzaW9uJTIyJTNBMSU3RA==_'
        )

        // Verify emoji content is preserved
        const serializedAgain = serialize(deserialized!)
        expect(serializedAgain).toBe(serialized)
    })

    it('serializes a current file correctly', () => {
        const input = {
            text: 'test current file',
            contextItems: [],
            editorState: {
                v: 'lexical-v1',
                minReaderV: 'lexical-v1',
                lexicalEditorState: {
                    root: {
                        type: 'root',
                        children: [
                            {
                                type: 'paragraph',
                                children: [
                                    {
                                        type: 'text',
                                        text: 'explain ',
                                        detail: 0,
                                        format: 0,
                                        mode: 'normal',
                                        style: '',
                                        version: 1,
                                    },
                                    {
                                        contextItem: {
                                            description: 'Picks the current file',
                                            id: 'current-file',
                                            name: 'current-file',
                                            title: 'Current File',
                                            type: 'current-file',
                                            uri: 'cody://current-file',
                                        },
                                        isFromInitialContext: false,
                                        text: 'current file',
                                        type: 'contextItemMention',
                                        version: 1,
                                    },
                                    {
                                        type: 'text',
                                        text: '. Thank you!',
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

        const serialized = serialize(input as SerializedPromptEditorValue)
        expect(serialized).toBe('explain cody://current-file. Thank you!')

        const deserialized = deserialize(serialized)
        expect(deserialized).toBeDefined()

        const serializedAgain = serialize(deserialized!)
        expect(serializedAgain).toBe(serialized)
    })
})

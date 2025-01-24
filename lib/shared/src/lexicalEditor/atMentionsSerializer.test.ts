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

    describe('various deserialization edge cases', () => {
        it('leading newlines', () => {
            const s =
                'Gradle best practices.\n\ncody://serialized.v1?data=JTdCJTIyY29udGV4dEl0ZW0lMjIlM0ElN0IlMjJ0eXBlJTIyJTNBJTIyb3BlbmN0eCUyMiUyQyUyMnVyaSUyMiUzQSUyMmh0dHBzJTNBJTJGJTJGZG9jcy5ncmFkbGUub3JnJTJGY3VycmVudCUyRnVzZXJndWlkZSUyRm9yZ2FuaXppbmdfZ3JhZGxlX3Byb2plY3RzLmh0bWwlMjIlMkMlMjJ0aXRsZSUyMiUzQSUyMk9yZ2FuaXppbmclMjBHcmFkbGUlMjBQcm9qZWN0cyUyMiUyQyUyMnByb3ZpZGVyVXJpJTIyJTNBJTIyaW50ZXJuYWwtd2ViLXByb3ZpZGVyJTIyJTJDJTIycHJvdmlkZXIlMjIlM0ElMjJvcGVuY3R4JTIyJTJDJTIybWVudGlvbiUyMiUzQSU3QiUyMnVyaSUyMiUzQSUyMmh0dHBzJTNBJTJGJTJGZG9jcy5ncmFkbGUub3JnJTJGY3VycmVudCUyRnVzZXJndWlkZSUyRm9yZ2FuaXppbmdfZ3JhZGxlX3Byb2plY3RzLmh0bWwlMjIlMkMlMjJkYXRhJTIyJTNBJTdCJTIyY29udGVudCUyMiUzQSUyMk92ZXJ2aWV3JTVDbiU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1c2VyZ3VpZGUuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnF1aWNrX3N0YXJ0Lmh0bWwlMjAlNUNuJTIwUmVsZWFzZXMlNUNuJTVDbiUyMCU1Q25odHRwcyUzQSUyRiUyRmdyYWRsZS5vcmclMkZyZWxlYXNlcyUyRiUyMCU1Q24uLiUyRnJlbGVhc2Utbm90ZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmluc3RhbGxhdGlvbi5odG1sJTIwJTVDbiUyM3VwZ3JhZGluZy1ncmFkbGUlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1cGdyYWRpbmdfdmVyc2lvbl84Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1cGdyYWRpbmdfdmVyc2lvbl83Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1cGdyYWRpbmdfdmVyc2lvbl82Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1cGdyYWRpbmdfdmVyc2lvbl81Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ1cGdyYWRpbmdfdmVyc2lvbl80Lmh0bWwlMjAlNUNuJTIwJTVDbiUyM21pZ3JhdGluZy10by1ncmFkbGUlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZtaWdyYXRpbmdfZnJvbV9tYXZlbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGbWlncmF0aW5nX2Zyb21fYW50Lmh0bWwlMjAlNUNuJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdHJvdWJsZXNob290aW5nLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZjb21wYXRpYmlsaXR5Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZmZWF0dXJlX2xpZmVjeWNsZS5odG1sJTIwJTVDbiUyMFJ1bm5pbmclMjBHcmFkbGUlMjBCdWlsZHMlNUNuJTVDbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdldHRpbmdfc3RhcnRlZF9lbmcuaHRtbCUyMCU1Q24lMjNydW5uaW5nLWludHJvZHVjdGlvbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdyYWRsZV9iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdyYWRsZV93cmFwcGVyX2Jhc2ljcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29tbWFuZF9saW5lX2ludGVyZmFjZV9iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnNldHRpbmdzX2ZpbGVfYmFzaWNzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9maWxlX2Jhc2ljcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGVwZW5kZW5jeV9tYW5hZ2VtZW50X2Jhc2ljcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdGFza19iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnBsdWdpbl9iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdyYWRsZV9vcHRpbWl6YXRpb25zLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9zY2Fucy5odG1sJTIwJTVDbiUyMCU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0MV9ncmFkbGVfaW5pdC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcGFydDJfZ3JhZGxlX3Rhc2tzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0M19ncmFkbGVfZGVwX21hbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcGFydDRfZ3JhZGxlX3BsdWdpbnMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnBhcnQ1X2dyYWRsZV9pbmNfYnVpbGRzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0Nl9ncmFkbGVfY2FjaGluZy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcGFydDdfZ3JhZGxlX3JlZnMuaHRtbCUyMCU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZncmFkbGVfaWRlcy5odG1sJTIwJTVDbiUyMEF1dGhvcmluZyUyMEdyYWRsZSUyMEJ1aWxkcyU1Q24lNUNuJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZ2V0dGluZ19zdGFydGVkX2Rldi5odG1sJTIwJTVDbiUyM2xlYXJuaW5nLXRoZS1iYXNpY3MlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZncmFkbGVfZGlyZWN0b3JpZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmludHJvX211bHRpX3Byb2plY3RfYnVpbGRzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9saWZlY3ljbGUuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRndyaXRpbmdfc2V0dGluZ3NfZmlsZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRndyaXRpbmdfYnVpbGRfc2NyaXB0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdHV0b3JpYWxfdXNpbmdfdGFza3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRndyaXRpbmdfdGFza3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnBsdWdpbnMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRndyaXRpbmdfcGx1Z2lucy5odG1sJTIwJTVDbiUyMCU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0MV9ncmFkbGVfaW5pdF9wcm9qZWN0Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0Ml9idWlsZF9saWZlY3ljbGUuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnBhcnQzX211bHRpX3Byb2plY3RfYnVpbGRzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0NF9zZXR0aW5nc19maWxlLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0NV9idWlsZF9zY3JpcHRzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0Nl93cml0aW5nX3Rhc2tzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwYXJ0N193cml0aW5nX3BsdWdpbnMuaHRtbCUyMCU1Q24lMjAlNUNuJTIzZ3JhZGxlLXByb3BlcnRpZXMlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwcm9wZXJ0aWVzX3Byb3ZpZGVycy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29sbGVjdGlvbnMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnNlcnZpY2VfaW5qZWN0aW9uLmh0bWwlMjAlNUNuJTIwJTVDbiUyM2F1dGhvcmluZy1tdWx0aS1wcm9qZWN0LWJ1aWxkcyUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRm11bHRpX3Byb2plY3RfYnVpbGRzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZWNsYXJpbmdfZGVwZW5kZW5jaWVzX2JldHdlZW5fc3VicHJvamVjdHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnNoYXJpbmdfYnVpbGRfbG9naWNfYmV0d2Vlbl9zdWJwcm9qZWN0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29tcG9zaXRlX2J1aWxkcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGbXVsdGlfcHJvamVjdF9jb25maWd1cmF0aW9uX2FuZF9leGVjdXRpb24uaHRtbCUyMCU1Q24lMjAlNUNuJTIzZGV2ZWxvcGluZy10YXNrcyUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRm1vcmVfYWJvdXRfdGFza3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmNvbnRyb2xsaW5nX3Rhc2tfZXhlY3V0aW9uLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZvcmdhbml6aW5nX3Rhc2tzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZpbXBsZW1lbnRpbmdfY3VzdG9tX3Rhc2tzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZsYXp5X2NvbmZpZ3VyYXRpb24uaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRndvcmtlcl9hcGkuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmN1c3RvbV90YXNrcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGYnVpbGRfc2VydmljZXMuaHRtbCUyMCU1Q24lMjAlNUNuJTIzZGV2ZWxvcGluZy1wbHVnaW5zJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY3VzdG9tX3BsdWdpbnMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmltcGxlbWVudGluZ19ncmFkbGVfcGx1Z2lucy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGaW1wbGVtZW50aW5nX2dyYWRsZV9wbHVnaW5zX3ByZWNvbXBpbGVkLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZpbXBsZW1lbnRpbmdfZ3JhZGxlX3BsdWdpbnNfYmluYXJ5Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ0ZXN0aW5nX2dyYWRsZV9wbHVnaW5zLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwdWJsaXNoaW5nX2dyYWRsZV9wbHVnaW5zLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZyZXBvcnRpbmdfcHJvYmxlbXMuaHRtbCUyMCU1Q24lMjAlNUNuJTIzb3RoZXItZGV2ZWxvcGluZy10b3BpY3MlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ3b3JraW5nX3dpdGhfZmlsZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmluaXRfc2NyaXB0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGF0YWZsb3dfYWN0aW9ucy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdGVzdF9raXQuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmFudC5odG1sJTIwJTVDbiUyMCU1Q24lMjBPcHRpbWl6aW5nJTIwR3JhZGxlJTIwQnVpbGRzJTVDbiU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9lbnZpcm9ubWVudC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGlyZWN0b3J5X2xheW91dC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGbG9nZ2luZy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29uZmlnX2dyYWRsZS5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcGVyZm9ybWFuY2UuaHRtbCUyMCU1Q24lMjNidWlsZC1jYWNoZSUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmJ1aWxkX2NhY2hlLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9jYWNoZV91c2VfY2FzZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmJ1aWxkX2NhY2hlX3BlcmZvcm1hbmNlLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZF9jYWNoZV9jb25jZXB0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY2FjaGluZ19qYXZhX3Byb2plY3RzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZjYWNoaW5nX2FuZHJvaWRfcHJvamVjdHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmJ1aWxkX2NhY2hlX2RlYnVnZ2luZy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29tbW9uX2NhY2hpbmdfcHJvYmxlbXMuaHRtbCUyMCU1Q24lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZjb25maWd1cmF0aW9uX2NhY2hlLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZjb250aW51b3VzX2J1aWxkcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGaW5zcGVjdC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGaXNvbGF0ZWRfcHJvamVjdHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmZpbGVfc3lzdGVtX3dhdGNoaW5nLmh0bWwlMjAlNUNuJTIwRGVwZW5kZW5jeSUyME1hbmFnZW1lbnQlNUNuJTVDbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdldHRpbmdfc3RhcnRlZF9kZXBfbWFuLmh0bWwlMjAlNUNuJTIzbGVhcm5pbmctdGhlLWJhc2ljcy1kZXBlbmRlbmN5LW1hbmFnZW1lbnQlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZWNsYXJpbmdfZGVwZW5kZW5jaWVzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZXBlbmRlbmN5X2NvbmZpZ3VyYXRpb25zLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZWNsYXJpbmdfcmVwb3NpdG9yaWVzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZjZW50cmFsaXppbmdfZGVwZW5kZW5jaWVzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZXBlbmRlbmN5X2NvbnN0cmFpbnRzX2NvbmZsaWN0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGVwZW5kZW5jeV9yZXNvbHV0aW9uLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ2YXJpYW50X2F3YXJlX3Jlc29sdXRpb24uaHRtbCUyMCU1Q24lMjAlNUNuJTIzZGVjbGFyaW5nLWRlcGVuZGVuY2llcyUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlY2xhcmluZ19kZXBlbmRlbmNpZXNfYmFzaWNzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ2aWV3aW5nX2RlYnVnZ2luZ19kZXBlbmRlbmNpZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfdmVyc2lvbnMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfY29uc3RyYWludHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlY2xhcmluZ19jb25maWd1cmF0aW9ucy5odG1sJTIwJTVDbiUyMCU1Q24lMjNkZWNsYXJpbmctcmVwb3NpdG9yaWVzJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGVjbGFyaW5nX3JlcG9zaXRvcmllc19iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmNlbnRyYWxpemluZ19yZXBvc2l0b3JpZXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnN1cHBvcnRlZF9yZXBvc2l0b3J5X3R5cGVzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZzdXBwb3J0ZWRfbWV0YWRhdGFfZm9ybWF0cy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGc3VwcG9ydGVkX3JlcG9zaXRvcnlfcHJvdG9jb2xzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZmaWx0ZXJpbmdfcmVwb3NpdG9yeV9jb250ZW50Lmh0bWwlMjAlNUNuJTIwJTVDbiUyM2NlbnRyYWxpemluZy1kZXBlbmRlbmNpZXMlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwbGF0Zm9ybXMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnZlcnNpb25fY2F0YWxvZ3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmNlbnRyYWxpemluZ19jYXRhbG9nX3BsYXRmb3JtLmh0bWwlMjAlNUNuJTIwJTVDbiUyM2RlcGVuZGVuY3ktbWFuYWdlbWVudCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfbG9ja2luZy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcmVzb2x1dGlvbl9ydWxlcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29tcG9uZW50X21ldGFkYXRhX3J1bGVzLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZXBlbmRlbmN5X2NhY2hpbmcuaHRtbCUyMCU1Q24lMjAlNUNuJTIzdW5kZXJzdGFuZGluZ19kZXBfcmVzJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdmFyaWFudF9tb2RlbC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY29tcG9uZW50X2NhcGFiaWxpdGllcy5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdmFyaWFudF9hdHRyaWJ1dGVzLmh0bWwlMjAlNUNuJTIwJTVDbiUyM2RlcGVuZGVuY3ktcmVzb2x1dGlvbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfcmVzb2x1dGlvbl9iYXNpY3MuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfZ3JhcGhfcmVzb2x1dGlvbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGYXJ0aWZhY3RfcmVzb2x1dGlvbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGYXJ0aWZhY3RfdHJhbnNmb3Jtcy5odG1sJTIwJTVDbiUyMCU1Q24lMjNwdWJsaXNoaW5nJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcHVibGlzaGluZ19zZXR1cC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcHVibGlzaGluZ19ncmFkbGVfbW9kdWxlX21ldGFkYXRhLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwdWJsaXNoaW5nX3NpZ25pbmcuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnB1Ymxpc2hpbmdfY3VzdG9taXphdGlvbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcHVibGlzaGluZ19tYXZlbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGcHVibGlzaGluZ19pdnkuaHRtbCUyMCU1Q24lMjAlNUNuJTIzb3RoZXIlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZkZXBlbmRlbmN5X3ZlcmlmaWNhdGlvbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZGVwZW5kZW5jeV92ZXJzaW9uX2FsaWdubWVudC5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZmVhdHVyZV92YXJpYW50cy5odG1sJTIwJTVDbiUyMCU1Q24lMjBQbGF0Zm9ybXMlNUNuJTVDbiUyMCU1Q24lMjNqdm0lMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZGluZ19qYXZhX3Byb2plY3RzLmh0bWwlMjYlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZqYXZhX3Rlc3RpbmcuaHRtbCUyNiUyMCU1Q24lMjNqYXZhLXRvb2xjaGFpbnMlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ0b29sY2hhaW5zLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZ0b29sY2hhaW5fcGx1Z2lucy5odG1sJTIwJTVDbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmRlcGVuZGVuY3lfbWFuYWdlbWVudF9mb3JfamF2YV9wcm9qZWN0cy5odG1sJTIwJTVDbiUyM2p2bS1wbHVnaW5zJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGamF2YV9saWJyYXJ5X3BsdWdpbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGYXBwbGljYXRpb25fcGx1Z2luLmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZqYXZhX3BsYXRmb3JtX3BsdWdpbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZ3Jvb3Z5X3BsdWdpbi5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGc2NhbGFfcGx1Z2luLmh0bWwlMjAlNUNuJTIwJTVDbiUyMCU1Q24lMjNjcHAlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZidWlsZGluZ19jcHBfcHJvamVjdHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmNwcF90ZXN0aW5nLmh0bWwlMjAlNUNuJTIwJTVDbiUyM3N3aWZ0JTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGYnVpbGRpbmdfc3dpZnRfcHJvamVjdHMuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnN3aWZ0X3Rlc3RpbmcuaHRtbCUyMCU1Q24lMjAlNUNuJTIwSW50ZWdyYXRpb24lNUNuJTVDbiUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRnRoaXJkX3BhcnR5X2ludGVncmF0aW9uLmh0bWwlMjAlNUNuJTIwUmVmZXJlbmNlJTVDbiU1Q24lMjAlNUNuJTIzZ3JhZGxlLWFwaSUyMCU1Q24uLiUyRmphdmFkb2MlMkZpbmRleC5odG1sJTNGb3ZlcnZpZXctc3VtbWFyeS5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZ3Jvb3Z5X2J1aWxkX3NjcmlwdF9wcmltZXIuaHRtbCUyMCU1Q24uLiUyRmRzbCUyRmluZGV4Lmh0bWwlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZrb3RsaW5fZHNsLmh0bWwlMjAlNUNuLi4lMkZrb3RsaW4tZHNsJTJGaW5kZXguaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRm1pZ3JhdGluZ19mcm9tX2dyb292eV90b19rb3RsaW5fZHNsLmh0bWwlMjAlNUNuJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGZ3JhZGxlX3dyYXBwZXIuaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdyYWRsZV9kYWVtb24uaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmNvbW1hbmRfbGluZV9pbnRlcmZhY2UuaHRtbCUyMCU1Q24lMjNjb3JlLXBsdWdpbnMlMjAlNUNuLi4lMkZ1c2VyZ3VpZGUlMkZwbHVnaW5fcmVmZXJlbmNlLmh0bWwlMjAlNUNuJTIwJTVDbiUyM2hvd3RvJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGY3Jvc3NfcHJvamVjdF9wdWJsaWNhdGlvbnMuaHRtbCUyMCU1Q24lMjAlNUNuLi4lMkZzYW1wbGVzJTJGaW5kZXguaHRtbCUyMCU1Q24uLiUyRnVzZXJndWlkZSUyRmdsb3NzYXJ5Lmh0bWwlMjAlNUNuaHR0cHMlM0ElMkYlMkZjb21tdW5pdHkuZ3JhZGxlLm9yZyUyRmNvb2tib29rJTJGJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdXNlcmd1aWRlX3NpbmdsZS5odG1sJTIwJTVDbi4uJTJGdXNlcmd1aWRlJTJGdXNlcmd1aWRlLnBkZiUyMCU1Q24lMjBPcmdhbml6aW5nJTIwR3JhZGxlJTIwUHJvamVjdHMlNUNuJTVDbiUyMHZlcnNpb24lMjA4LjEyJTIwQ29udGVudHMlMjAlNUNuJTIzc2VjJTNBc2VwYXJhdGVfbGFuZ3VhZ2Vfc291cmNlX2ZpbGVzJTIwJTVDbiUyM3NlYyUzQXNlcGFyYXRlX3Rlc3RfdHlwZV9zb3VyY2VfZmlsZXMlMjAlNUNuJTIzc2VjJTNBdXNlX3N0YW5kYXJkX2NvbnZlbnRpb25zJTIwJTVDbiUyM3NlYyUzQXNldHRpbmdzX2ZpbGUlMjAlNUNuJTIzc2VjJTNBYnVpbGRfc291cmNlcyUyMCU1Q24lMjNkZWNsYXJlX3Byb3BlcnRpZXNfaW5fZ3JhZGxlX3Byb3BlcnRpZXNfZmlsZSUyMCU1Q24lMjNhdm9pZF9vdmVybGFwcGluZ190YXNrX291dHB1dHMlMjAlNUNuJTIzc2VjJTNBY3VzdG9tX2dyYWRsZV9kaXN0cmlidXRpb24lMjAlNUNuJTIwJTVDbiU1Q25Tb3VyY2UlMjBjb2RlJTIwYW5kJTIwYnVpbGQlMjBsb2dpYyUyMG9mJTIwZXZlcnklMjBzb2Z0d2FyZSUyMHByb2plY3QlMjBzaG91bGQlMjBiZSUyMG9yZ2FuaXplZCUyMGluJTIwYSUyMG1lYW5pbmdmdWwlMjB3YXkuJTIwVGhpcyUyMHBhZ2UlMjBsYXlzJTIwb3V0JTIwdGhlJTIwYmVzdCUyMHByYWN0aWNlcyUyMHRoYXQlMjBsZWFkJTIwdG8lMjByZWFkYWJsZSUyQyUyMG1haW50YWluYWJsZSUyMHByb2plY3RzLiUyMFRoZSUyMGZvbGxvd2luZyUyMHNlY3Rpb25zJTIwYWxzbyUyMHRvdWNoJTIwb24lMjBjb21tb24lMjBwcm9ibGVtcyUyMGFuZCUyMGhvdyUyMHRvJTIwYXZvaWQlMjB0aGVtLiU1Q24lNUNuJTIwJTIzc2VjJTNBc2VwYXJhdGVfbGFuZ3VhZ2Vfc291cmNlX2ZpbGVzJTIzc2VjJTNBc2VwYXJhdGVfbGFuZ3VhZ2Vfc291cmNlX2ZpbGVzJTIwR3JhZGxlJUUyJTgwJTk5cyUyMGxhbmd1YWdlJTIwcGx1Z2lucyUyMGVzdGFibGlzaCUyMGNvbnZlbnRpb25zJTIwZm9yJTIwZGlzY292ZXJpbmclMjBhbmQlMjBjb21waWxpbmclMjBzb3VyY2UlMjBjb2RlLiUyMEZvciUyMGV4YW1wbGUlMkMlMjBhJTIwcHJvamVjdCUyMGFwcGx5aW5nJTIwdGhlJTIwamF2YV9wbHVnaW4uaHRtbCUyM2phdmFfcGx1Z2luJTIwd2lsbCUyMGF1dG9tYXRpY2FsbHklMjBjb21waWxlJTIwdGhlJTIwY29kZSUyMGluJTIwdGhlJTIwZGlyZWN0b3J5JTIwc3JjJTJGbWFpbiUyRmphdmEuJTIwT3RoZXIlMjBsYW5ndWFnZSUyMHBsdWdpbnMlMjBmb2xsb3clMjB0aGUlMjBzYW1lJTIwcGF0dGVybi4lMjBUaGUlMjBsYXN0JTIwcG9ydGlvbiUyMG9mJTIwdGhlJTIwZGlyZWN0b3J5JTIwcGF0aCUyMHVzdWFsbHklMjBpbmRpY2F0ZXMlMjB0aGUlMjBleHBlY3RlZCUyMGxhbmd1YWdlJTIwb2YlMjB0aGUlMjBzb3VyY2UlMjBmaWxlcy4lNUNuJTVDbiUyMFNvbWUlMjBjb21waWxlcnMlMjBhcmUlMjBjYXBhYmxlJTIwb2YlMjBjcm9zcy1jb21waWxpbmclMjBtdWx0aXBsZSUyMGxhbmd1YWdlcyUyMGluJTIwdGhlJTIwc2FtZSUyMHNvdXJjZSUyMGRpcmVjdG9yeS4lMjBUaGUlMjBHcm9vdnklMjBjb21waWxlciUyMGNhbiUyMGhhbmRsZSUyMHRoZSUyMHNjZW5hcmlvJTIwb2YlMjBtaXhpbmclMjBKYXZhJTIwYW5kJTIwR3Jvb3Z5JTIwc291cmNlJTIwZmlsZXMlMjBsb2NhdGVkJTIwaW4lMjBzcmMlMkZtYWluJTJGZ3Jvb3Z5LiUyMEdyYWRsZSUyMHJlY29tbWVuZHMlMjB0aGF0JTIweW91JTIwcGxhY2UlMjBzb3VyY2VzJTIwaW4lMjBkaXJlY3RvcmllcyUyMGFjY29yZGluZyUyMHRvJTIwdGhlaXIlMjBsYW5ndWFnZSUyQyUyMGJlY2F1c2UlMjBidWlsZHMlMjBhcmUlMjBtb3JlJTIwcGVyZm9ybWFudCUyMGFuZCUyMGJvdGglMjB0aGUlMjB1c2VyJTIwYW5kJTIwYnVpbGQlMjBjYW4lMjBtYWtlJTIwc3Ryb25nZXIlMjBhc3N1bXB0aW9ucy4lNUNuJTVDbiUyMFRoZSUyMGZvbGxvd2luZyUyMHNvdXJjZSUyMHRyZWUlMjBjb250YWlucyUyMEphdmElMjBhbmQlMjBLb3RsaW4lMjBzb3VyY2UlMjBmaWxlcy4lMjBKYXZhJTIwc291cmNlJTIwZmlsZXMlMjBsaXZlJTIwaW4lMjBzcmMlMkZtYWluJTJGamF2YSUyQyUyMHdoZXJlYXMlMjBLb3RsaW4lMjBzb3VyY2UlMjBmaWxlcyUyMGxpdmUlMjBpbiUyMHNyYyUyRm1haW4lMkZrb3RsaW4uJTVDbiU1Q24lMjAuJTIwJUUyJTk0JTlDJUUyJTk0JTgwJUUyJTk0JTgwJTIwYnVpbGQuZ3JhZGxlLmt0cyUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMHNyYyUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMG1haW4lMjAlRTIlOTQlOUMlRTIlOTQlODAlRTIlOTQlODAlMjBqYXZhJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwSGVsbG9Xb3JsZC5qYXZhJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwa290bGluJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwVXRpbHMua3QlMjAuJTIwJUUyJTk0JTlDJUUyJTk0JTgwJUUyJTk0JTgwJTIwYnVpbGQuZ3JhZGxlJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwc3JjJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwbWFpbiUyMCVFMiU5NCU5QyVFMiU5NCU4MCVFMiU5NCU4MCUyMGphdmElMjAlRTIlOTQlODIlQzIlQTAlQzIlQTAlMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBIZWxsb1dvcmxkLmphdmElMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBrb3RsaW4lMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBVdGlscy5rdCUyMCU1Q24lNUNuJTIzc2VjJTNBc2VwYXJhdGVfdGVzdF90eXBlX3NvdXJjZV9maWxlcyUyM3NlYyUzQXNlcGFyYXRlX3Rlc3RfdHlwZV9zb3VyY2VfZmlsZXMlMjBJdCVFMiU4MCU5OXMlMjB2ZXJ5JTIwY29tbW9uJTIwdGhhdCUyMGElMjBwcm9qZWN0JTIwZGVmaW5lcyUyMGFuZCUyMGV4ZWN1dGVzJTIwZGlmZmVyZW50JTIwdHlwZXMlMjBvZiUyMHRlc3RzJTIwZS5nLiUyMHVuaXQlMjB0ZXN0cyUyQyUyMGludGVncmF0aW9uJTIwdGVzdHMlMkMlMjBmdW5jdGlvbmFsJTIwdGVzdHMlMjBvciUyMHNtb2tlJTIwdGVzdHMuJTIwT3B0aW1hbGx5JTJDJTIwdGhlJTIwdGVzdCUyMHNvdXJjZSUyMGNvZGUlMjBmb3IlMjBlYWNoJTIwdGVzdCUyMHR5cGUlMjBzaG91bGQlMjBiZSUyMHN0b3JlZCUyMGluJTIwZGVkaWNhdGVkJTIwc291cmNlJTIwZGlyZWN0b3JpZXMuJTIwU2VwYXJhdGVkJTIwdGVzdCUyMHNvdXJjZSUyMGNvZGUlMjBoYXMlMjBhJTIwcG9zaXRpdmUlMjBpbXBhY3QlMjBvbiUyMG1haW50YWluYWJpbGl0eSUyMGFuZCUyMHNlcGFyYXRpb24lMjBvZiUyMGNvbmNlcm5zJTIwYXMlMjB5b3UlMjBjYW4lMjBydW4lMjB0ZXN0JTIwdHlwZXMlMjBpbmRlcGVuZGVudCUyMGZyb20lMjBlYWNoJTIwb3RoZXIuJTVDbiU1Q24lMjBIYXZlJTIwYSUyMGxvb2slMjBhdCUyMHRoZSUyMC4uJTJGc2FtcGxlcyUyRnNhbXBsZV9qdm1fbXVsdGlfcHJvamVjdF93aXRoX2FkZGl0aW9uYWxfdGVzdF90eXBlcy5odG1sJTIwdGhhdCUyMGRlbW9uc3RyYXRlcyUyMGhvdyUyMGElMjBzZXBhcmF0ZSUyMGludGVncmF0aW9uJTIwdGVzdHMlMjBjb25maWd1cmF0aW9uJTIwY2FuJTIwYmUlMjBhZGRlZCUyMHRvJTIwYSUyMEphdmEtYmFzZWQlMjBwcm9qZWN0LiU1Q24lNUNuJTIwJTIzc2VjJTNBdXNlX3N0YW5kYXJkX2NvbnZlbnRpb25zJTIzc2VjJTNBdXNlX3N0YW5kYXJkX2NvbnZlbnRpb25zJTIwQWxsJTIwR3JhZGxlJTIwY29yZSUyMHBsdWdpbnMlMjBmb2xsb3clMjB0aGUlMjBzb2Z0d2FyZSUyMGVuZ2luZWVyaW5nJTIwcGFyYWRpZ20lMjBodHRwcyUzQSUyRiUyRmVuLndpa2lwZWRpYS5vcmclMkZ3aWtpJTJGQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb24uJTIwVGhlJTIwcGx1Z2luJTIwbG9naWMlMjBwcm92aWRlcyUyMHVzZXJzJTIwd2l0aCUyMHNlbnNpYmxlJTIwZGVmYXVsdHMlMjBhbmQlMjBzdGFuZGFyZHMlMkMlMjB0aGUlMjBjb252ZW50aW9ucyUyQyUyMGluJTIwYSUyMGNlcnRhaW4lMjBjb250ZXh0LiUyMExldCVFMiU4MCU5OXMlMjB0YWtlJTIwdGhlJTIwamF2YV9wbHVnaW4uaHRtbCUyM2phdmFfcGx1Z2luJTIwYXMlMjBhbiUyMGV4YW1wbGUuJTVDbiU1Q24lMjAlNUNuJTIwSXQlMjBkZWZpbmVzJTIwdGhlJTIwZGlyZWN0b3J5JTIwc3JjJTJGbWFpbiUyRmphdmElMjBhcyUyMHRoZSUyMGRlZmF1bHQlMjBzb3VyY2UlMjBkaXJlY3RvcnklMjBmb3IlMjBjb21waWxhdGlvbi4lNUNuJTVDbiUyMCU1Q24lMjBUaGUlMjBvdXRwdXQlMjBkaXJlY3RvcnklMjBmb3IlMjBjb21waWxlZCUyMHNvdXJjZSUyMGNvZGUlMjBhbmQlMjBvdGhlciUyMGFydGlmYWN0cyUyMChsaWtlJTIwdGhlJTIwSkFSJTIwZmlsZSklMjBpcyUyMGJ1aWxkLiU1Q24lNUNuJTIwJTVDbiUyMEJ5JTIwc3RpY2tpbmclMjB0byUyMHRoZSUyMGRlZmF1bHQlMjBjb252ZW50aW9ucyUyQyUyMG5ldyUyMGRldmVsb3BlcnMlMjB0byUyMHRoZSUyMHByb2plY3QlMjBpbW1lZGlhdGVseSUyMGtub3clMjBob3clMjB0byUyMGZpbmQlMjB0aGVpciUyMHdheSUyMGFyb3VuZC4lMjBXaGlsZSUyMHRob3NlJTIwY29udmVudGlvbnMlMjBjYW4lMjBiZSUyMHJlY29uZmlndXJlZCUyQyUyMGl0JTIwbWFrZXMlMjBpdCUyMGhhcmRlciUyMHRvJTIwYnVpbGQlMjBzY3JpcHQlMjB1c2VycyUyMGFuZCUyMGF1dGhvcnMlMjB0byUyMG1hbmFnZSUyMHRoZSUyMGJ1aWxkJTIwbG9naWMlMjBhbmQlMjBpdHMlMjBvdXRjb21lLiUyMFRyeSUyMHRvJTIwc3RpY2slMjB0byUyMHRoZSUyMGRlZmF1bHQlMjBjb252ZW50aW9ucyUyMGFzJTIwbXVjaCUyMGFzJTIwcG9zc2libGUlMjBleGNlcHQlMjBpZiUyMHlvdSUyMG5lZWQlMjB0byUyMGFkYXB0JTIwdG8lMjB0aGUlMjBsYXlvdXQlMjBvZiUyMGElMjBsZWdhY3klMjBwcm9qZWN0LiUyMFJlZmVyJTIwdG8lMjB0aGUlMjByZWZlcmVuY2UlMjBwYWdlJTIwb2YlMjB0aGUlMjByZWxldmFudCUyMHBsdWdpbiUyMHRvJTIwbGVhcm4lMjBhYm91dCUyMGl0cyUyMGRlZmF1bHQlMjBjb252ZW50aW9ucy4lNUNuJTVDbiUyMCUyM3NlYyUzQXNldHRpbmdzX2ZpbGUlMjNzZWMlM0FzZXR0aW5nc19maWxlJTIwR3JhZGxlJTIwdHJpZXMlMjB0byUyMGxvY2F0ZSUyMGElMjBzZXR0aW5ncy5ncmFkbGUlMjAoR3Jvb3Z5JTIwRFNMKSUyMG9yJTIwYSUyMHNldHRpbmdzLmdyYWRsZS5rdHMlMjAoS290bGluJTIwRFNMKSUyMGZpbGUlMjB3aXRoJTIwZXZlcnklMjBpbnZvY2F0aW9uJTIwb2YlMjB0aGUlMjBidWlsZC4lMjBGb3IlMjB0aGF0JTIwcHVycG9zZSUyQyUyMHRoZSUyMHJ1bnRpbWUlMjB3YWxrcyUyMHRoZSUyMGhpZXJhcmNoeSUyMG9mJTIwdGhlJTIwZGlyZWN0b3J5JTIwdHJlZSUyMHVwJTIwdG8lMjB0aGUlMjByb290JTIwZGlyZWN0b3J5LiUyMFRoZSUyMGFsZ29yaXRobSUyMHN0b3BzJTIwc2VhcmNoaW5nJTIwYXMlMjBzb29uJTIwYXMlMjBpdCUyMGZpbmRzJTIwdGhlJTIwc2V0dGluZ3MlMjBmaWxlLiU1Q24lNUNuJTIwQWx3YXlzJTIwYWRkJTIwYSUyMHNldHRpbmdzLmdyYWRsZSUyMHRvJTIwdGhlJTIwcm9vdCUyMGRpcmVjdG9yeSUyMG9mJTIweW91ciUyMGJ1aWxkJTIwdG8lMjBhdm9pZCUyMHRoZSUyMGluaXRpYWwlMjBwZXJmb3JtYW5jZSUyMGltcGFjdC4lMjBUaGUlMjBmaWxlJTIwY2FuJTIwZWl0aGVyJTIwYmUlMjBlbXB0eSUyMG9yJTIwZGVmaW5lJTIwdGhlJTIwZGVzaXJlZCUyMG5hbWUlMjBvZiUyMHRoZSUyMHByb2plY3QuJTVDbiU1Q24lMjBBJTIwbXVsdGktcHJvamVjdCUyMGJ1aWxkJTIwbXVzdCUyMGhhdmUlMjBhJTIwc2V0dGluZ3MuZ3JhZGxlKC5rdHMpJTIwZmlsZSUyMGluJTIwdGhlJTIwcm9vdCUyMHByb2plY3QlMjBvZiUyMHRoZSUyMG11bHRpLXByb2plY3QlMjBoaWVyYXJjaHkuJTIwSXQlMjBpcyUyMHJlcXVpcmVkJTIwYmVjYXVzZSUyMHRoZSUyMHNldHRpbmdzJTIwZmlsZSUyMGRlZmluZXMlMjB3aGljaCUyMHByb2plY3RzJTIwYXJlJTIwdGFraW5nJTIwcGFydCUyMGluJTIwYSUyMG11bHRpX3Byb2plY3RfYnVpbGRzLmh0bWwlMjNtdWx0aV9wcm9qZWN0X2J1aWxkcy4lMjBCZXNpZGVzJTIwZGVmaW5pbmclMjBpbmNsdWRlZCUyMHByb2plY3RzJTJDJTIweW91JTIwbWlnaHQlMjBuZWVkJTIwaXQlMjB0byUyMCUyM29yZ2FuaXppbmdfZ3JhZGxlX3Byb2plY3RzLiU1Q24lNUNuJTIwVGhlJTIwZm9sbG93aW5nJTIwZXhhbXBsZSUyMHNob3dzJTIwYSUyMHN0YW5kYXJkJTIwR3JhZGxlJTIwcHJvamVjdCUyMGxheW91dCUzQSU1Q24lNUNuJTIwLiUyMCVFMiU5NCU5QyVFMiU5NCU4MCVFMiU5NCU4MCUyMHNldHRpbmdzLmdyYWRsZS5rdHMlMjAlRTIlOTQlOUMlRTIlOTQlODAlRTIlOTQlODAlMjBzdWJwcm9qZWN0LW9uZSUyMCVFMiU5NCU4MiUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMGJ1aWxkLmdyYWRsZS5rdHMlMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBzdWJwcm9qZWN0LXR3byUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMGJ1aWxkLmdyYWRsZS5rdHMlMjAuJTIwJUUyJTk0JTlDJUUyJTk0JTgwJUUyJTk0JTgwJTIwc2V0dGluZ3MuZ3JhZGxlJTIwJUUyJTk0JTlDJUUyJTk0JTgwJUUyJTk0JTgwJTIwc3VicHJvamVjdC1vbmUlMjAlRTIlOTQlODIlMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBidWlsZC5ncmFkbGUlMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBzdWJwcm9qZWN0LXR3byUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMGJ1aWxkLmdyYWRsZSUyMCU1Q24lNUNuJTIzc2VjJTNBYnVpbGRfc291cmNlcyUyM3NlYyUzQWJ1aWxkX3NvdXJjZXMlMjBDb21wbGV4JTIwYnVpbGQlMjBsb2dpYyUyMGlzJTIwdXN1YWxseSUyMGElMjBnb29kJTIwY2FuZGlkYXRlJTIwZm9yJTIwYmVpbmclMjBlbmNhcHN1bGF0ZWQlMjBlaXRoZXIlMjBhcyUyMGN1c3RvbSUyMHRhc2slMjBvciUyMGJpbmFyeSUyMHBsdWdpbi4lMjBDdXN0b20lMjB0YXNrJTIwYW5kJTIwcGx1Z2luJTIwaW1wbGVtZW50YXRpb25zJTIwc2hvdWxkJTIwbm90JTIwbGl2ZSUyMGluJTIwdGhlJTIwYnVpbGQlMjBzY3JpcHQuJTIwSXQlMjBpcyUyMHZlcnklMjBjb252ZW5pZW50JTIwdG8lMjB1c2UlMjBidWlsZFNyYyUyMGZvciUyMHRoYXQlMjBwdXJwb3NlJTIwYXMlMjBsb25nJTIwYXMlMjB0aGUlMjBjb2RlJTIwZG9lcyUyMG5vdCUyMG5lZWQlMjB0byUyMGJlJTIwc2hhcmVkJTIwYW1vbmclMjBtdWx0aXBsZSUyQyUyMGluZGVwZW5kZW50JTIwcHJvamVjdHMuJTVDbiU1Q24lMjBUaGUlMjBkaXJlY3RvcnklMjBidWlsZFNyYyUyMGlzJTIwdHJlYXRlZCUyMGFzJTIwYW4lMjBjb21wb3NpdGVfYnVpbGRzLmh0bWwlMjNjb21wb3NpdGVfYnVpbGRfaW50cm8uJTIwVXBvbiUyMGRpc2NvdmVyeSUyMG9mJTIwdGhlJTIwZGlyZWN0b3J5JTJDJTIwR3JhZGxlJTIwYXV0b21hdGljYWxseSUyMGNvbXBpbGVzJTIwdGhpcyUyMGNvZGUlMjBhbmQlMjBwdXRzJTIwaXQlMjBpbiUyMHRoZSUyMGNsYXNzcGF0aCUyMG9mJTIweW91ciUyMGJ1aWxkJTIwc2NyaXB0LiUyMEZvciUyMG11bHRpLXByb2plY3QlMjBidWlsZHMlMjB0aGVyZSUyMGNhbiUyMGJlJTIwb25seSUyMG9uZSUyMGJ1aWxkU3JjJTIwZGlyZWN0b3J5JTJDJTIwd2hpY2glMjBoYXMlMjB0byUyMHNpdCUyMGluJTIwdGhlJTIwcm9vdCUyMHByb2plY3QlMjBkaXJlY3RvcnkuJTIwYnVpbGRTcmMlMjBzaG91bGQlMjBiZSUyMHByZWZlcnJlZCUyMG92ZXIlMjBwbHVnaW5zLmh0bWwlMjNzZWMlM0FzY3JpcHRfcGx1Z2lucyUyMGFzJTIwaXQlMjBpcyUyMGVhc2llciUyMHRvJTIwbWFpbnRhaW4lMkMlMjByZWZhY3RvciUyMGFuZCUyMHRlc3QlMjB0aGUlMjBjb2RlLiU1Q24lNUNuJTIwYnVpbGRTcmMlMjB1c2VzJTIwdGhlJTIwc2FtZSUyMGphdmFfcGx1Z2luLmh0bWwlMjNqYXZhbGF5b3V0JTIwYXBwbGljYWJsZSUyMHRvJTIwSmF2YSUyMGFuZCUyMEdyb292eSUyMHByb2plY3RzLiUyMEl0JTIwYWxzbyUyMHByb3ZpZGVzJTIwZGlyZWN0JTIwYWNjZXNzJTIwdG8lMjB0aGUlMjBHcmFkbGUlMjBBUEkuJTIwQWRkaXRpb25hbCUyMGRlcGVuZGVuY2llcyUyMGNhbiUyMGJlJTIwZGVjbGFyZWQlMjBpbiUyMGElMjBkZWRpY2F0ZWQlMjBidWlsZC5ncmFkbGUlMjB1bmRlciUyMGJ1aWxkU3JjLiU1Q24lNUNuJTIwRXhhbXBsZSUyMDEuJTIwJTIzZXgtY3VzdG9tLWJ1aWxkc3JjLWJ1aWxkLXNjcmlwdCUyMGJ1aWxkU3JjJTJGYnVpbGQuZ3JhZGxlLmt0cyUyMHJlcG9zaXRvcmllcyUyMCU3QiUyMG1hdmVuQ2VudHJhbCgpJTIwJTdEJTIwZGVwZW5kZW5jaWVzJTIwJTdCJTIwdGVzdEltcGxlbWVudGF0aW9uKCU1QyUyMmp1bml0JTNBanVuaXQlM0E0LjEzJTVDJTIyKSUyMCU3RCUyMGJ1aWxkU3JjJTJGYnVpbGQuZ3JhZGxlJTIwcmVwb3NpdG9yaWVzJTIwJTdCJTIwbWF2ZW5DZW50cmFsKCklMjAlN0QlMjBkZXBlbmRlbmNpZXMlMjAlN0IlMjB0ZXN0SW1wbGVtZW50YXRpb24lMjAnanVuaXQlM0FqdW5pdCUzQTQuMTMnJTIwJTdEJTIwJTVDbiU1Q25BJTIwdHlwaWNhbCUyMHByb2plY3QlMjBpbmNsdWRpbmclMjBidWlsZFNyYyUyMGhhcyUyMHRoZSUyMGZvbGxvd2luZyUyMGxheW91dC4lMjBBbnklMjBjb2RlJTIwdW5kZXIlMjBidWlsZFNyYyUyMHNob3VsZCUyMHVzZSUyMGElMjBwYWNrYWdlJTIwc2ltaWxhciUyMHRvJTIwYXBwbGljYXRpb24lMjBjb2RlLiUyME9wdGlvbmFsbHklMkMlMjB0aGUlMjBidWlsZFNyYyUyMGRpcmVjdG9yeSUyMGNhbiUyMGhvc3QlMjBhJTIwYnVpbGQlMjBzY3JpcHQlMjBpZiUyMGFkZGl0aW9uYWwlMjBjb25maWd1cmF0aW9uJTIwaXMlMjBuZWVkZWQlMjAoZS5nLiUyMHRvJTIwYXBwbHklMjBwbHVnaW5zJTIwb3IlMjB0byUyMGRlY2xhcmUlMjBkZXBlbmRlbmNpZXMpLiU1Q24lNUNuJTIwLiUyMCVFMiU5NCU5QyVFMiU5NCU4MCVFMiU5NCU4MCUyMGJ1aWxkU3JjJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTlDJUUyJTk0JTgwJUUyJTk0JTgwJTIwYnVpbGQuZ3JhZGxlLmt0cyUyMCVFMiU5NCU4MiVDMiVBMCVDMiVBMCUyMCVFMiU5NCU5NCVFMiU5NCU4MCVFMiU5NCU4MCUyMHNyYyUyMCVFMiU5NCU4MiVDMiVBMCVDMiVBMCUyMCVFMiU5NCU5QyVFMiU5NCU4MCVFMiU5NCU4MCUyMG1haW4lMjAlRTIlOTQlODIlQzIlQTAlQzIlQTAlMjAlRTIlOTQlODIlQzIlQTAlQzIlQTAlMjAlRTIlOTQlOTQlRTIlOTQlODAlRTIlOTQlODAlMjBqYXZhJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwY29tJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTk0JUUyJTk0JTgwJUUyJTk0JTgwJTIwZW50ZXJwcmlzZSUyMCVFMiU5NCU4MiVDMiVBMCVDMiVBMCUyMCVFMiU5NCU4MiVDMiVBMCVDMiVBMCUyMCVFMiU5NCU5QyVFMiU5NCU4MCVFMiU5NCU4MCUyMERlcGxveS5qYXZhJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTgyJUMyJUEwJUMyJUEwJTIwJUUyJTk0JTk0JUVGJUJGJUJEJTIyJTdEJTdEJTJDJTIyc291cmNlJTIyJTNBJTIydXNlciUyMiU3RCUyQyUyMmlzRnJvbUluaXRpYWxDb250ZXh0JTIyJTNBZmFsc2UlMkMlMjJ0eXBlJTIyJTNBJTIyY29udGV4dEl0ZW1NZW50aW9uJTIyJTJDJTIydGV4dCUyMiUzQSUyMk9yZ2FuaXppbmclMjBHcmFkbGUlMjBQcm9qZWN0cyUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_ \n\n'

            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('leading . and trailing *', () => {
            const s =
                'Some key things to pay attention to are as follows.cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* Declaring properties in the gradle.properties file, if there are any performance related properties missing, they should be added.cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* Use a global version catalog for managing dependency versions.cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* Try to replace any deprecated DSL usage.cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* Separate source files per test type are definedcody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* A settings.gradle or settings.gradle.kts is being used.cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* buildSrc is being used to abstract imperative logiccody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_* Overlapping task outputs are avoided.\n'

            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles multiple consecutive mentions', () => {
            const s =
                'Look at cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_ cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_ cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles mentions with special characters in the encoded data', () => {
            const s =
                'Check cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles mentions at start and end of string', () => {
            const s =
                'cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_ middle text cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles mentions with surrounding punctuation', () => {
            const s =
                'Look (cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_), then [cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_]!'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles mentions with line breaks and whitespace', () => {
            const s =
                'First cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_\nThen cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_\r\n  cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })

        it('handles escaped serialized mentions', () => {
            const s =
                'Link to \\cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_ but reference cody://serialized.v1?data=JTdCJTIydHlwZSUyMiUzQSUyMmxpbmVicmVhayUyMiUyQyUyMnZlcnNpb24lMjIlM0ExJTdE_'
            const des = deserialize(s)
            expect(JSON.stringify(des)).not.contains('cody://serialized.v1')
        })
    })
})

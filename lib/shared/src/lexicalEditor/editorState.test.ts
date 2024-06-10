import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { isWindows } from '../common/platform'
import { PromptString, ps } from '../prompt/prompt-string'
import {
    STATE_VERSION_CURRENT,
    type SerializedPromptEditorState,
    lexicalEditorStateFromPromptString,
    textContentFromSerializedLexicalNode,
} from './editorState'
import { CONTEXT_ITEM_MENTION_NODE_TYPE } from './nodes'

const prefix = isWindows() ? '\\' : ''

describe('textContentFromSerializedLexicalNode', () => {
    test('empty root', () => {
        expect(
            textContentFromSerializedLexicalNode({
                type: 'root',
                children: [],
                direction: null,
                format: 'left',
                indent: 0,
                version: 0,
            } as SerializedRootNode)
        ).toEqual('')
    })

    test('fixture', () => {
        expect(
            textContentFromSerializedLexicalNode(
                FILE_MENTION_EDITOR_STATE_FIXTURE.lexicalEditorState.root,
                annotateMentionNodes
            )
        ).toBe('What does <<@Symbol1>> in <<@dir/dir/file-a-1.py>> do? Also use <<@README.md:2-8>>.')
    })
})

describe('lexicalEditorStateFromPromptString', () => {
    test('converts to rich mentions', async () => {
        const input = ps`What are @${PromptString.fromDisplayPath(
            URI.file('foo.go')
        )}:3-5 and @${PromptString.fromDisplayPath(URI.file('bar.go'))} about?`
        const editorState = lexicalEditorStateFromPromptString(input)
        expect(editorState.root).toEqual<SerializedRootNode>({
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'What are ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: `@${prefix}foo.go:3-5`,
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///foo.go',
                                content: undefined,
                                source: 'user',
                                range: {
                                    start: {
                                        line: 2,
                                        character: 0,
                                    },
                                    end: {
                                        line: 5,
                                        character: 0,
                                    },
                                },
                            },
                            isFromInitialContext: false,
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' and ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: `@${prefix}bar.go`,
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///bar.go',
                                content: undefined,
                                range: undefined,
                                source: 'editor',
                            },
                            isFromInitialContext: false,
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' about?',
                            type: 'text',
                            version: 1,
                        },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                } as SerializedLexicalNode,
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        })
        expect(textContentFromSerializedLexicalNode(editorState.root, annotateMentionNodes)).toBe(
            `What are <<@${prefix}foo.go:3-5>> and <<@${prefix}bar.go>> about?`
        )
    })
})

const FILE_MENTION_EDITOR_STATE_FIXTURE: SerializedPromptEditorState = {
    v: STATE_VERSION_CURRENT,
    lexicalEditorState: {
        root: {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: 'What does ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@Symbol1',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'symbol',
                                uri: 'file:///a/b/file1.go',
                                range: {
                                    start: {
                                        line: 2,
                                        character: 13,
                                    },
                                    end: {
                                        line: 4,
                                        character: 1,
                                    },
                                },
                                symbolName: 'Symbol1',
                                kind: 'function',
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' in ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@dir/dir/file-a-1.py',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: ' do? Also use ',
                            type: 'text',
                            version: 1,
                        },
                        {
                            detail: 1,
                            format: 0,
                            mode: 'token',
                            style: '',
                            text: '@README.md:2-8',
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///dir/dir/file-a-1.py',
                                range: {
                                    start: {
                                        line: 1,
                                        character: 0,
                                    },
                                    end: {
                                        line: 8,
                                        character: 0,
                                    },
                                },
                            },
                        },
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text: '.',
                            type: 'text',
                            version: 1,
                        },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                } as SerializedLexicalNode,
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    },
}

function annotateMentionNodes(node: SerializedLexicalNode): string | undefined {
    return 'text' in node && node.type === CONTEXT_ITEM_MENTION_NODE_TYPE
        ? `<<${node.text}>>`
        : undefined
}

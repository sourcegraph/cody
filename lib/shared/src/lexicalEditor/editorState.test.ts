import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextItemSource } from '../codebase-context/messages'
import { PromptString, ps } from '../prompt/prompt-string'
import { lexicalEditorStateFromPromptString, textContentFromSerializedLexicalNode } from './editorState'
import {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE,
} from './fixtures'
import type { SerializedContextItemMentionNode } from './nodes'

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

    test('fixture from chip mentions', () => {
        expect(
            textContentFromSerializedLexicalNode(
                FILE_MENTION_EDITOR_STATE_FIXTURE.lexicalEditorState.root,
                wrapMention
            )
        ).toBe('What does <<Symbol1>> in <<file-a-1.py>> do? Also use <<README.md:2-8>>.')
    })

    test('fixture from text mentions', () => {
        expect(
            textContentFromSerializedLexicalNode(
                OLD_TEXT_FILE_MENTION_EDITOR_STATE_FIXTURE.lexicalEditorState.root,
                wrapMention
            )
        ).toBe('What does <<Symbol1>> in <<file-a-1.py>> do? Also use <<README.md:2-8>>.')
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
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///foo.go',
                                content: undefined,
                                source: ContextItemSource.User,
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
                            text: 'foo.go:3-5',
                        } satisfies SerializedContextItemMentionNode,
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
                            type: 'contextItemMention',
                            version: 1,
                            contextItem: {
                                type: 'file',
                                uri: 'file:///bar.go',
                                content: undefined,
                                range: undefined,
                                source: ContextItemSource.Editor,
                            },
                            isFromInitialContext: false,
                            text: 'bar.go',
                        } satisfies SerializedContextItemMentionNode,
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
        expect(textContentFromSerializedLexicalNode(editorState.root, wrapMention)).toBe(
            'What are <<foo.go:3-5>> and <<bar.go>> about?'
        )
    })
})

function wrapMention(text: string): string | undefined {
    return `<<${text}>>`
}

import type { SerializedLexicalNode, SerializedRootNode } from 'lexical'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextItemSource } from '../codebase-context/messages'
import { PromptString, ps } from '../prompt/prompt-string'
import { editorStateFromPromptString, textContentFromSerializedLexicalNode } from './editorState'
import {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    GENERATE_UNIT_TEST_EDITOR_STATE_FIXTURE,
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

    test('fixture from template', () => {
        expect(
            textContentFromSerializedLexicalNode(
                GENERATE_UNIT_TEST_EDITOR_STATE_FIXTURE.lexicalEditorState.root,
                wrapMention
            )
        ).toBe(
            'Your task is to generate a suit of multiple unit tests for the functions defined inside the <<file1.go>> file.\n\nUse the <<mention the testing framework>> framework to generate the unit tests. Follow the example tests from the <<mention an example test file>> test file. Include unit tests for the following cases: <<list test cases>>.\n\nEnsure that the unit tests cover all the edge cases and validate the expected functionality of the functions'
        )
    })
})

describe('editorStateFromPromptString', () => {
    test('converts to rich mentions', async () => {
        const input = ps`What are @${PromptString.fromDisplayPath(
            URI.file('foo.go')
        )}:3-5 and @${PromptString.fromDisplayPath(URI.file('bar.go'))} about?`
        const editorState = editorStateFromPromptString(input)
        expect(editorState.lexicalEditorState.root).toEqual<SerializedRootNode>({
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
        expect(
            textContentFromSerializedLexicalNode(editorState.lexicalEditorState.root, wrapMention)
        ).toBe('What are <<foo.go:3-5>> and <<bar.go>> about?')
    })

    test('parse templates', () => {
        const input = ps`Generate tests for @${PromptString.fromDisplayPath(
            URI.file('foo.go')
        )} using {{mention framework}} framework to generate the unit tests`
        const editorState = editorStateFromPromptString(input, { parseTemplates: true })
        expect(editorState.lexicalEditorState.root).matchSnapshot()
        expect(
            textContentFromSerializedLexicalNode(editorState.lexicalEditorState.root, wrapMention)
        ).toBe(
            'Generate tests for <<foo.go>> using <<mention framework>> framework to generate the unit tests'
        )
    })
})

function wrapMention(text: string): string | undefined {
    return `<<${text}>>`
}

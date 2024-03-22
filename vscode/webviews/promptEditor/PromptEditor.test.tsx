import type { SerializedLexicalNode } from 'lexical'
import { describe, expect, test } from 'vitest'
import { contextItemsFromPromptEditorValue } from './PromptEditor'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from './fixtures'
import type { SerializedContextItem } from './nodes/ContextItemMentionNode'

describe('serializedPromptEditorStateFromText', () => {
    test('empty', () =>
        expect(
            contextItemsFromPromptEditorValue({
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
                                        text: 'Hello, world',
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
            })
        ).toEqual([]))

    test('with mentions', () =>
        expect(contextItemsFromPromptEditorValue(FILE_MENTION_EDITOR_STATE_FIXTURE)).toEqual<
            SerializedContextItem[]
        >([
            {
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
            {
                type: 'file',
                uri: 'file:///dir/dir/file-a-1.py',
            },
            {
                type: 'file',
                uri: 'file:///dir/dir/file-a-1.py',
                range: {
                    end: {
                        character: 0,
                        line: 8,
                    },
                    start: {
                        character: 0,
                        line: 1,
                    },
                },
            },
        ]))
})

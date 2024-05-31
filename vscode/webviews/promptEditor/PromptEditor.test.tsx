import { describe, expect, test } from 'vitest'
import {
    contextItemsFromPromptEditorValue,
    serializedPromptEditorStateFromText,
    textContentFromSerializedLexicalNode,
} from './PromptEditor'
import { FILE_MENTION_EDITOR_STATE_FIXTURE } from './fixtures'
import type { SerializedContextItem } from './nodes/ContextItemMentionNode'

describe('serializedPromptEditorStateFromText', () => {
    test('empty', () =>
        expect(contextItemsFromPromptEditorValue(serializedPromptEditorStateFromText('foo'))).toEqual(
            []
        ))

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
describe('textContentFromSerializedLexicalNode', () => {
    test('empty root', () => {
        expect(
            textContentFromSerializedLexicalNode({
                type: 'root',
                children: [],
            })
        ).toEqual('')
    })

    test('fixture', () => {
        expect(
            textContentFromSerializedLexicalNode(
                FILE_MENTION_EDITOR_STATE_FIXTURE.lexicalEditorState.root
            )
        ).toBe('What does @Symbol1 in @dir/dir/file-a-1.py do? Also use @README.md:2-8.')
    })
})

import {
    FILE_MENTION_EDITOR_STATE_FIXTURE,
    type SerializedContextItem,
    contextItemsFromPromptEditorValue,
    serializedPromptEditorStateFromText,
} from '@sourcegraph/cody-shared'
import { describe, expect, test } from 'vitest'

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
                uri: 'file:///dir/dir/README.md',
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

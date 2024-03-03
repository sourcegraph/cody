import { describe, expect, test } from 'vitest'
import { contextItemsFromPromptEditorValue, createEditorValueFromText } from './PromptEditor'
import { FILE_MENTION_VALUE_FIXTURE } from './fixtures'
import type { SerializedContextItem } from './nodes/ContextItemMentionNode'

describe('contextItemsFromPromptEditorValue', () => {
    test('empty', () =>
        expect(contextItemsFromPromptEditorValue(createEditorValueFromText('foo'))).toEqual([]))

    test('with mentions', () =>
        expect(contextItemsFromPromptEditorValue(FILE_MENTION_VALUE_FIXTURE)).toEqual<
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
        ]))
})

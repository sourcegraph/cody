import { toSerializedPromptEditorValue } from '@sourcegraph/cody-shared'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
import { expect, test } from 'vitest'
import { RICH_EDITOR_NODES } from '../nodes'
import { $createContextItemMentionNode } from '../nodes/ContextItemMentionNode'
import {
    toSerializedPromptEditorValue as fromProseMirrorToEditorValue,
    fromSerializedPromptEditorState,
} from './lexical-interop'
import { schema } from './promptInput'

test('lexical -> prosemirror -> lexical', () => {
    const editor = createEditor({ nodes: RICH_EDITOR_NODES })
    editor.update(
        () => {
            const root = $getRoot()
            const paragraph = $createParagraphNode()
            paragraph.append(
                $createTextNode('before '),
                $createContextItemMentionNode(
                    { type: 'file', uri: 'test.ts' },
                    { isFromInitialContext: true }
                ),
                $createTextNode(' after')
            )
            root.append(paragraph)
        },
        { discrete: true }
    )
    const editorValue = toSerializedPromptEditorValue(editor)

    expect(
        fromProseMirrorToEditorValue(
            schema.nodeFromJSON(fromSerializedPromptEditorState(editorValue.editorState))
        )
    ).toEqual(editorValue)
})

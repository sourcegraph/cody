import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    type LexicalEditor,
    createEditor,
} from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'
import { isEditorContentOnlyInitialContext } from './initialContext'
import { RICH_EDITOR_NODES } from './nodes'
import { $createContextItemMentionNode } from './nodes/ContextItemMentionNode'

describe('isEditorContentOnlyInitialContext', () => {
    let editor: LexicalEditor

    beforeEach(() => {
        editor = createEditor({ nodes: RICH_EDITOR_NODES })
    })

    it('should return true when content is only initial context', () => {
        editor.update(
            () => {
                const root = $getRoot()
                const paragraph = $createParagraphNode()
                paragraph.append(
                    $createContextItemMentionNode(
                        { type: 'file', uri: 'test.ts' },
                        { isFromInitialContext: true }
                    ),
                    $createTextNode(' ')
                )
                root.append(paragraph)
            },
            { discrete: true }
        )
        expect(isEditorContentOnlyInitialContext(editor)).toBe(true)
    })

    it('should return false when content includes non-initial context', () => {
        editor.update(
            () => {
                const root = $getRoot()
                const paragraph = $createParagraphNode()
                paragraph.append(
                    $createContextItemMentionNode(
                        { type: 'file', uri: 'test1.ts' },
                        { isFromInitialContext: true }
                    ),
                    $createTextNode(' '),
                    $createContextItemMentionNode(
                        { type: 'file', uri: 'test2.ts' },
                        { isFromInitialContext: false }
                    ),
                    $createTextNode(' ')
                )
                root.append(paragraph)
            },
            { discrete: true }
        )
        expect(isEditorContentOnlyInitialContext(editor)).toBe(false)
    })

    it('should return false when content includes additional text', () => {
        editor.update(
            () => {
                const root = $getRoot()
                const paragraph = $createParagraphNode()
                const contextItem = $createContextItemMentionNode(
                    { type: 'file', uri: 'test.ts' },
                    { isFromInitialContext: true }
                )
                const space = $createTextNode(' ')
                const additionalText = $createTextNode('Additional text')
                paragraph.append(contextItem, space, additionalText)
                root.append(paragraph)
            },
            { discrete: true }
        )
        expect(isEditorContentOnlyInitialContext(editor)).toBe(false)
    })
})

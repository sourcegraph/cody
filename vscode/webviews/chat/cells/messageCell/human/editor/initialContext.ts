import type { ContextItem } from '@sourcegraph/cody-shared'
import { $createTextNode, $getRoot, type LexicalEditor, TextNode } from 'lexical'
import {
    $createContextItemMentionNode,
    ContextItemMentionNode,
} from '../../../../../promptEditor/nodes/ContextItemMentionNode'

export function lexicalNodesForContextItems(
    items: ContextItem[],
    {
        isFromInitialContext,
    }: {
        isFromInitialContext: boolean
    }
): (TextNode | ContextItemMentionNode)[] {
    const nodes = items.flatMap(item => [
        $createContextItemMentionNode(item, { isFromInitialContext }),
        $createTextNode(' '),
    ])
    return nodes
}

export function isEditorContentOnlyInitialContext(editor: LexicalEditor): boolean {
    return editor.getEditorState().read(() => {
        const root = $getRoot()
        return (
            root
                .getAllTextNodes()
                .every(
                    node =>
                        (node instanceof ContextItemMentionNode && node.isFromInitialContext) ||
                        (node instanceof TextNode && node.getTextContent() === ' ')
                ) && /\S $/.test(root.getTextContent())
        )
    })
}

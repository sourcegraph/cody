import type { ContextItem } from '@sourcegraph/cody-shared'
import {
    $createTextNode,
    $getRoot,
    ElementNode,
    type LexicalEditor,
    type LexicalNode,
    ParagraphNode,
    RootNode,
    TextNode,
} from 'lexical'
import { $createContextItemMentionNode, ContextItemMentionNode } from './nodes/ContextItemMentionNode'

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
    function walk(node: LexicalNode, fn: (node: LexicalNode) => boolean): void {
        if (!fn(node)) {
            return
        }
        if (node instanceof ElementNode) {
            for (const child of node.getChildren()) {
                walk(child, fn)
            }
        }
        return
    }

    return editor.getEditorState().read(() => {
        const root = $getRoot()
        let onlyInitialContext = true
        walk(root, node => {
            if (!onlyInitialContext) {
                return false // no need to traverse anymore
            }

            if (node instanceof ContextItemMentionNode) {
                if (!node.isFromInitialContext) {
                    onlyInitialContext = false
                }
            } else if (node instanceof TextNode) {
                if (node.getTextContent().trim() !== '') {
                    onlyInitialContext = false
                }
            } else if (!(node instanceof ParagraphNode || node instanceof RootNode)) {
                onlyInitialContext = false
            }

            return onlyInitialContext
        })
        return onlyInitialContext
    })
}

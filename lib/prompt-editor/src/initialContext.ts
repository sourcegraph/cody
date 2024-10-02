import type { ContextItem, SerializedContextItem } from '@sourcegraph/cody-shared'
import {
    $createTextNode,
    $getRoot,
    type LexicalEditor,
    ParagraphNode,
    RootNode,
    TextNode,
} from 'lexical'
import { walkLexicalNodes } from './lexicalUtils'
import { $createContextItemMentionNode, ContextItemMentionNode } from './nodes/ContextItemMentionNode'

export function lexicalNodesForContextItems(
    items: (ContextItem | SerializedContextItem)[],
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
        let onlyInitialContext = true
        walkLexicalNodes(root, node => {
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

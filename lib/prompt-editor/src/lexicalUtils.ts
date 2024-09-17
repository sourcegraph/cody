import type { SerializedContextItem } from '@sourcegraph/cody-shared'
import {
    $createRangeSelection,
    $getRoot,
    $isDecoratorNode,
    $isElementNode,
    $isTextNode,
    $setSelection,
    type DecoratorNode,
    ElementNode,
    type LexicalEditor,
    type LexicalNode,
    type RootNode,
    type TextNode,
} from 'lexical'
import { ContextItemMentionNode } from './nodes/ContextItemMentionNode'

function getLastNode(root: RootNode): ElementNode | TextNode | null {
    const descendant = root.getLastDescendant()
    if ($isElementNode(descendant) || $isTextNode(descendant)) {
        return descendant
    }
    if ($isDecoratorNode(descendant)) {
        return descendant.getParent()
    }
    return root
}

export function $selectEnd(): void {
    const root = $getRoot()
    const lastNode = getLastNode(root)
    if (lastNode) {
        $selectAfter(lastNode)
    }
}

export function $selectAfter(node: ElementNode | TextNode | DecoratorNode<unknown>): void {
    const key = node.getKey()
    const offset = $isElementNode(node)
        ? node.getChildrenSize()
        : $isTextNode(node)
          ? node.getTextContentSize()
          : 0
    const type = $isElementNode(node) ? 'element' : 'text'
    const newSelection = $createRangeSelection()
    newSelection.anchor.set(key, offset, type)
    newSelection.focus.set(key, offset, type)
    $setSelection(newSelection)
}

export function walkLexicalNodes(node: LexicalNode, fn: (node: LexicalNode) => boolean): void {
    if (!fn(node)) {
        return
    }
    if (node instanceof ElementNode) {
        for (const child of node.getChildren()) {
            walkLexicalNodes(child, fn)
        }
    }
    return
}

export function getContextItemMentionNodes(editor: LexicalEditor): SerializedContextItem[] {
    return editor.getEditorState().read(() => {
        const nodes: SerializedContextItem[] = []
        const root = $getRoot()
        walkLexicalNodes(root, node => {
            if (node instanceof ContextItemMentionNode) {
                nodes.push(node.contextItem)
            }
            return true
        })
        return nodes
    })
}

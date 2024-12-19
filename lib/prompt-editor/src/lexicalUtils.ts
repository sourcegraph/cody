import { $insertFirst } from '@lexical/utils'
import type { ContextItem, SerializedContextItem } from '@sourcegraph/cody-shared'
import {
    $createParagraphNode,
    $createRangeSelection,
    $createTextNode,
    $getRoot,
    $insertNodes,
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
import { lexicalNodesForContextItems } from './initialContext'
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

export function getContextItemsForEditor(editor: LexicalEditor): SerializedContextItem[] {
    return editor.getEditorState().read(() => {
        const nodes: SerializedContextItem[] = []
        walkLexicalNodes($getRoot(), node => {
            if (node instanceof ContextItemMentionNode) {
                nodes.push(node.contextItem)
            }
            return true
        })
        return nodes
    })
}

export function walkContextItemMentionNodes(
    node: LexicalNode,
    visit: (mention: ContextItemMentionNode) => void
): void {
    walkLexicalNodes(node, node => {
        if (node instanceof ContextItemMentionNode) {
            visit(node)
        }
        return true
    })
}

/**
 * Inserts the given context items before or after the current value of the editor.
 *
 * @param items The context items to insert.
 * @param position Where to insert the context items, relative to the editor value. Defaults to 'after'.
 * @param sep The separator to insert between the current value and the context items.
 */
export function $insertMentions(
    items: (SerializedContextItem | ContextItem)[],
    position: 'before' | 'after',
    sep?: string
): void {
    const nodesToInsert = lexicalNodesForContextItems(
        items,
        {
            isFromInitialContext: false,
        },
        sep
    )
    const pNode = $createParagraphNode()

    switch (position) {
        case 'before': {
            pNode.append(...nodesToInsert)
            $insertFirst($getRoot(), pNode)
            break
        }
        case 'after': {
            pNode.append(
                $createTextNode(getWhitespace($getRoot())),
                ...nodesToInsert,
                $createTextNode(sep)
            )
            $insertNodes([pNode])
            break
        }
    }
}

export function getWhitespace(root: RootNode): string {
    const needsWhitespaceBefore = !/(^|\s)$/.test(root.getTextContent())
    return needsWhitespaceBefore ? ' ' : ''
}

/**
 * Helper function to update the editor state and get a promise that resolves when the update is done.
 *
 * IMPORTANT: The promise will never resolve when the update function does not cause any changes to the editor state.
 * (not until we update to a version that includes https://github.com/facebook/lexical/pull/6894).
 * To mitigate this, the update function should return a boolean, where  `false` indicates that it did not cause any changes,
 * in which case the promise will resolve immediately.
 */
export function update(editor: LexicalEditor, updateFn: () => boolean): Promise<void> {
    return new Promise(resolve => {
        editor.update(
            () => {
                const result = updateFn()
                if (result === false) {
                    resolve()
                }
            },
            { onUpdate: resolve }
        )
    })
}

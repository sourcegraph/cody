import {
    $createRangeSelection,
    $getRoot,
    $isDecoratorNode,
    $isElementNode,
    $isTextNode,
    $setSelection,
    type DecoratorNode,
    type ElementNode,
    type RootNode,
    type TextNode,
} from 'lexical'

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

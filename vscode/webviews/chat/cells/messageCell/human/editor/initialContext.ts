import { type ContextItem, isDefined } from '@sourcegraph/cody-shared'
import {
    $createTextNode,
    $getRoot,
    type EditorConfig,
    ElementNode,
    type LexicalEditor,
    type SerializedElementNode,
    type SerializedLexicalNode,
    TextNode,
} from 'lexical'
import {
    $createContextItemMentionNode,
    ContextItemMentionNode,
} from '../../../../../promptEditor/nodes/ContextItemMentionNode'
import styles from './initialContext.module.css'

export function lexicalNodesForContextItems(
    items: ContextItem[],
    {
        withSpaces,
        isFromInitialContext,
    }: {
        withSpaces: boolean
        isFromInitialContext: boolean
    }
): (TextNode | ContextItemMentionNode | InitialContextAnchorNode)[] {
    const mentionNodes = items.flatMap(item =>
        [
            withSpaces ? $createTextNode(' ') : null,
            $createContextItemMentionNode(item, { isFromInitialContext }),
        ].filter(isDefined)
    )
    if (mentionNodes.length === 0) {
        return []
    }
    const trailingSpaceNode = $createTextNode(' ')
    return [
        ...mentionNodes,
        withSpaces || isFromInitialContext ? trailingSpaceNode : null,
        isFromInitialContext ? $createInitialContextEndAnchor() : null,
    ].filter(isDefined)
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
                        node instanceof InitialContextAnchorNode ||
                        (node instanceof TextNode && node.getTextContent() === ' ')
                ) && /\S $/.test(root.getTextContent())
        )
    })
}

/**
 * A node that goes after all initial context and lets us display a placeholder even when the editor
 * is non-empty.
 */
export class InitialContextAnchorNode extends ElementNode {
    static getType(): string {
        return 'initialContextAnchor'
    }

    static clone(node: InitialContextAnchorNode): InitialContextAnchorNode {
        return new InitialContextAnchorNode(node.__key)
    }

    static importJSON(): InitialContextAnchorNode {
        return $createInitialContextEndAnchor()
    }

    private static CLASS_NAMES = `initial-context-anchor-node ${styles.initialContextAnchorNode}`

    createDOM(_config: EditorConfig): HTMLElement {
        const dom = document.createElement('span')
        dom.className = InitialContextAnchorNode.CLASS_NAMES
        return dom
    }

    canInsertTextBefore(): boolean {
        return false
    }

    canInsertTextAfter(): boolean {
        return false
    }

    isInline(): boolean {
        return true
    }

    updateDOM(_prevNode: unknown, _dom: HTMLElement): boolean {
        return false
    }

    exportJSON(): SerializedElementNode<SerializedLexicalNode> {
        return {
            ...super.exportJSON(),
            type: InitialContextAnchorNode.getType(),
        }
    }
}

export function $createInitialContextEndAnchor(): InitialContextAnchorNode {
    const node = new InitialContextAnchorNode()
    return node
}

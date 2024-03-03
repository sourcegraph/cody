import type { Spread } from 'lexical'
import styles from './ContextItemMentionNode.module.css'

import {
    $applyNodeReplacement,
    type DOMConversionMap,
    type DOMConversionOutput,
    type DOMExportOutput,
    type EditorConfig,
    type LexicalNode,
    type NodeKey,
    type SerializedTextNode,
    TextNode,
} from 'lexical'

export type SerializedContextItemMentionNode = Spread<
    {
        mentionName: string
    },
    SerializedTextNode
>

function convertContextItemMentionElement(domNode: HTMLElement): DOMConversionOutput | null {
    const textContent = domNode.textContent

    if (textContent !== null) {
        const node = $createContextItemMentionNode(textContent)
        return {
            node,
        }
    }

    return null
}

const DOM_DATA_ATTR = 'data-lexical-mention'

export class ContextItemMentionNode extends TextNode {
    __contextItemMention: string

    static getType(): string {
        return 'contextItemMention'
    }

    static clone(node: ContextItemMentionNode): ContextItemMentionNode {
        return new ContextItemMentionNode(node.__contextItemMention, node.__text, node.__key)
    }
    static importJSON(serializedNode: SerializedContextItemMentionNode): ContextItemMentionNode {
        const node = $createContextItemMentionNode(serializedNode.mentionName)
        node.setTextContent(serializedNode.text)
        node.setFormat(serializedNode.format)
        node.setDetail(serializedNode.detail)
        node.setMode(serializedNode.mode)
        node.setStyle(serializedNode.style)
        return node
    }

    constructor(mentionName: string, text?: string, key?: NodeKey) {
        super(text ?? `@${mentionName}`, key)
        this.__contextItemMention = mentionName
    }

    exportJSON(): SerializedContextItemMentionNode {
        return {
            ...super.exportJSON(),
            mentionName: this.__contextItemMention,
            type: ContextItemMentionNode.getType(),
            version: 1,
        }
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = styles.contextItemMentionNode
        return dom
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute(DOM_DATA_ATTR, 'true')
        element.textContent = this.__text
        return { element }
    }

    static importDOM(): DOMConversionMap | null {
        return {
            span: (domNode: HTMLElement) => {
                if (!domNode.hasAttribute(DOM_DATA_ATTR)) {
                    return null
                }
                return {
                    conversion: convertContextItemMentionElement,
                    priority: 1,
                }
            },
        }
    }

    isTextEntity(): true {
        return true
    }

    canInsertTextBefore(): boolean {
        return false
    }

    canInsertTextAfter(): boolean {
        return false
    }
}

export function $createContextItemMentionNode(mentionName: string): ContextItemMentionNode {
    const mentionNode = new ContextItemMentionNode(mentionName)
    mentionNode.setMode('token').toggleDirectionless()
    return $applyNodeReplacement(mentionNode)
}

export function $isContextItemMentionNode(
    node: LexicalNode | null | undefined
): node is ContextItemMentionNode {
    return node instanceof ContextItemMentionNode
}

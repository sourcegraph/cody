import type { Spread } from 'lexical'
import styles from './MentionNode.module.css'

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

export type SerializedMentionNode = Spread<
    {
        mentionName: string
    },
    SerializedTextNode
>

function convertMentionElement(domNode: HTMLElement): DOMConversionOutput | null {
    const textContent = domNode.textContent

    if (textContent !== null) {
        const node = $createMentionNode(textContent)
        return {
            node,
        }
    }

    return null
}

export class MentionNode extends TextNode {
    __mention: string

    static getType(): string {
        return 'mention'
    }

    static clone(node: MentionNode): MentionNode {
        return new MentionNode(node.__mention, node.__text, node.__key)
    }
    static importJSON(serializedNode: SerializedMentionNode): MentionNode {
        const node = $createMentionNode(serializedNode.mentionName)
        node.setTextContent(serializedNode.text)
        node.setFormat(serializedNode.format)
        node.setDetail(serializedNode.detail)
        node.setMode(serializedNode.mode)
        node.setStyle(serializedNode.style)
        return node
    }

    constructor(mentionName: string, text?: string, key?: NodeKey) {
        super(text ?? `@${mentionName}`, key)
        this.__mention = mentionName
    }

    exportJSON(): SerializedMentionNode {
        return {
            ...super.exportJSON(),
            mentionName: this.__mention,
            type: 'mention',
            version: 1,
        }
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = `mention ${styles.mentionNode}`
        return dom
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute('data-lexical-mention', 'true')
        element.textContent = this.__text
        return { element }
    }

    static importDOM(): DOMConversionMap | null {
        return {
            span: (domNode: HTMLElement) => {
                if (!domNode.hasAttribute('data-lexical-mention')) {
                    return null
                }
                return {
                    conversion: convertMentionElement,
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

export function $createMentionNode(mentionName: string): MentionNode {
    const mentionNode = new MentionNode(mentionName)
    mentionNode.setMode('token').toggleDirectionless()
    return $applyNodeReplacement(mentionNode)
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
    return node instanceof MentionNode
}

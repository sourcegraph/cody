import type { SerializedLexicalNode, Spread } from 'lexical'
import styles from './ContextItemMentionNode.module.css'

import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemSymbol,
    displayLineRange,
    displayPath,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'
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
import { URI } from 'vscode-uri'

/**
 * The subset of {@link ContextItem} fields that we need to store to identify and display context
 * item mentions.
 */
export type SerializedContextItem = { uri: string; content?: undefined } & (
    | Omit<ContextItemFile, 'uri' | 'content'>
    | Omit<ContextItemSymbol, 'uri' | 'content'>
)

export function serializeContextItem(
    contextItem: ContextItem | SerializedContextItem
): SerializedContextItem {
    // Make sure we only bring over the fields on the context item that we need, or else we
    // could accidentally include tons of data (including the entire contents of files).
    return {
        ...contextItem,
        uri: contextItem.uri.toString(),

        // Don't include the `content` (if it's present) because it's quite large, and we don't need
        // to serialize it here. It can be hydrated on demand.
        content: undefined,
    }
}

export function deserializeContextItem(contextItem: SerializedContextItem): ContextItem {
    return { ...contextItem, uri: URI.parse(contextItem.uri) }
}

export type SerializedContextItemMentionNode = Spread<
    { contextItem: SerializedContextItem },
    SerializedTextNode
>

function convertContextItemMentionElement(domNode: HTMLElement): DOMConversionOutput | null {
    const data = domNode.getAttribute(DOM_DATA_ATTR)
    if (data !== null) {
        try {
            const contextItem: SerializedContextItem = JSON.parse(data)
            const node = $createContextItemMentionNode(contextItem)
            return { node }
        } catch (error) {
            console.error(error)
            return null
        }
    }

    return null
}

const DOM_DATA_ATTR = 'data-lexical-context-item-mention'

export class ContextItemMentionNode extends TextNode {
    static getType(): string {
        return 'contextItemMention'
    }

    static clone(node: ContextItemMentionNode): ContextItemMentionNode {
        return new ContextItemMentionNode(node.contextItem, node.__text, node.__key)
    }
    static importJSON(serializedNode: SerializedContextItemMentionNode): ContextItemMentionNode {
        const node = $createContextItemMentionNode(serializedNode.contextItem)
        node.setTextContent(serializedNode.text)
        node.setFormat(serializedNode.format)
        node.setDetail(serializedNode.detail)
        node.setMode(serializedNode.mode)
        node.setStyle(serializedNode.style)
        return node
    }

    private contextItem: SerializedContextItem

    constructor(
        contextItemWithAllFields: ContextItem | SerializedContextItem,
        text?: string,
        key?: NodeKey
    ) {
        // Make sure we only bring over the fields on the context item that we need, or else we
        // could accidentally include tons of data (including the entire contents of files).
        const contextItem = serializeContextItem(contextItemWithAllFields)

        super(text ?? contextItemMentionNodeDisplayText(contextItem), key)

        this.contextItem = contextItem
    }

    exportJSON(): SerializedContextItemMentionNode {
        return {
            ...super.exportJSON(),
            contextItem: this.contextItem,
            type: ContextItemMentionNode.getType(),
            version: 1,
        }
    }

    private static CLASS_NAMES = `context-item-mention-node ${styles.contextItemMentionNode}`

    createDOM(config: EditorConfig): HTMLElement {
        const element = super.createDOM(config)
        element.className = ContextItemMentionNode.CLASS_NAMES
        return element
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute(DOM_DATA_ATTR, JSON.stringify(this.contextItem))
        element.className = ContextItemMentionNode.CLASS_NAMES

        const link = document.createElement('a')
        const { href, target } = webviewOpenURIForContextItem({
            uri: URI.parse(this.contextItem.uri),
            range: this.contextItem.range,
        })
        link.href = href
        if (target) {
            link.target = target
        }
        link.textContent = this.__text
        element.appendChild(link)

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

export function contextItemMentionNodeDisplayText(contextItem: SerializedContextItem): string {
    // A displayed range of `foo.txt:2-4` means "include all of lines 2, 3, and 4", which means the
    // range needs to go to the start (0th character) of line 5. Also, `RangeData` is 0-indexed but
    // display ranges are 1-indexed.
    const rangeText = contextItem.range ? `:${displayLineRange(contextItem.range)}` : ''
    if (contextItem.type === 'file') {
        return `@${displayPath(URI.parse(contextItem.uri))}${rangeText}`
    }
    if (contextItem.type === 'symbol') {
        return `@${displayPath(URI.parse(contextItem.uri))}${rangeText}#${contextItem.symbolName}`
    }
    // @ts-ignore
    throw new Error(`unrecognized context item type ${contextItem.type}`)
}

export function $createContextItemMentionNode(
    contextItem: ContextItem | SerializedContextItem
): ContextItemMentionNode {
    const node = new ContextItemMentionNode(contextItem)
    node.setMode('token').toggleDirectionless()
    contextItem.type === 'file' &&
        contextItem.isTooLarge &&
        node.setStyle('color: var(--vscode-list-errorForeground)')
    return $applyNodeReplacement(node)
}

export function $isContextItemMentionNode(
    node: LexicalNode | null | undefined
): node is ContextItemMentionNode {
    return node instanceof ContextItemMentionNode
}

export function isSerializedContextItemMentionNode(
    node: SerializedLexicalNode | null | undefined
): node is SerializedContextItemMentionNode {
    return Boolean(node && node.type === ContextItemMentionNode.getType())
}

export function $createContextItemTextNode(contextItem: ContextItem | SerializedContextItem): TextNode {
    const atNode = new ContextItemMentionNode(contextItem)
    const textNode = new TextNode(atNode.__text)
    return $applyNodeReplacement(textNode)
}

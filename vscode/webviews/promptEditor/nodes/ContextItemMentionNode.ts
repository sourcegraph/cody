import type { SerializedLexicalNode, Spread } from 'lexical'
import styles from './ContextItemMentionNode.module.css'

import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemSymbol,
    displayPath,
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
export type SerializedContextItem = { uri: string } & Pick<ContextItem, 'range'> &
    (Pick<ContextItemFile, 'type'> | Pick<ContextItemSymbol, 'type' | 'range' | 'symbolName' | 'kind'>)

export function serializeContextItem(
    contextItem: ContextItem | SerializedContextItem
): SerializedContextItem {
    // Make sure we only bring over the fields on the context item that we need, or else we
    // could accidentally include tons of data (including the entire contents of files).
    return {
        ...(contextItem.type === 'file'
            ? { type: contextItem.type, uri: contextItem.uri.toString() }
            : {
                  type: contextItem.type,
                  uri: contextItem.uri.toString(),
                  range: contextItem.range,
                  symbolName: contextItem.symbolName,
                  kind: contextItem.kind,
              }),
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
        return new ContextItemMentionNode(node.contextItem, node.hidden, node.__text, node.__key)
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
        private hidden?: boolean,
        text?: string,
        key?: NodeKey
    ) {
        // Make sure we only bring over the fields on the context item that we need, or else we
        // could accidentally include tons of data (including the entire contents of files).
        const contextItem = serializeContextItem(contextItemWithAllFields)

        // HACK(sqs): Since we don't pass the full editorState in the transcript, when we
        // deserialize the editorState from `text` and `contextItems`, we can't recreate the inline
        // mention nodes from the raw `text`. Therefore, we add on mention nodes to the end based on
        // the `contextItems`. But we don't want to show these to the user in the message, since
        // they would duplicate what is now plain text (for example, `What does @main.go do?
        // @main.go`).
        super(text ?? (hidden ? '\u200b' : contextItemMentionNodeDisplayText(contextItem)), key)

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

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = `context-item-mention-node ${styles.contextItemMentionNode}`
        return dom
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute(DOM_DATA_ATTR, JSON.stringify(this.contextItem))
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

export function contextItemMentionNodeDisplayText(contextItem: SerializedContextItem): string {
    if (contextItem.type === 'file') {
        return `@${displayPath(URI.parse(contextItem.uri))}`
    }
    if (contextItem.type === 'symbol') {
        return `@#${contextItem.symbolName}`
    }
    // @ts-ignore
    throw new Error(`unrecognized context item type ${contextItem.type}`)
}

export function $createContextItemMentionNode(
    contextItem: ContextItem | SerializedContextItem,
    hidden?: boolean
): ContextItemMentionNode {
    const node = new ContextItemMentionNode(contextItem, hidden)
    node.setMode('token').toggleDirectionless()
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

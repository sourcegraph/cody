import {
    CONTEXT_ITEM_MENTION_NODE_TYPE,
    type ContextItem,
    type SerializedContextItem,
    type SerializedContextItemMentionNode,
    displayLineRange,
    displayPath,
    displayPathBasename,
    serializeContextItem,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'
import {
    $applyNodeReplacement,
    type DOMConversionMap,
    type DOMConversionOutput,
    type DOMExportOutput,
    type EditorConfig,
    type NodeKey,
    TextNode,
} from 'lexical'
import { URI } from 'vscode-uri'
import styles from './ContextItemMentionNode.module.css'

export const MENTION_CLASS_NAME = styles.contextItemMentionNode

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
    static getType(): typeof CONTEXT_ITEM_MENTION_NODE_TYPE {
        return CONTEXT_ITEM_MENTION_NODE_TYPE
    }

    static clone(node: ContextItemMentionNode): ContextItemMentionNode {
        return new ContextItemMentionNode(
            node.contextItem,
            node.__text,
            node.__key,
            node.isFromInitialContext
        )
    }
    static importJSON(serializedNode: SerializedContextItemMentionNode): ContextItemMentionNode {
        const node = $createContextItemMentionNode(serializedNode.contextItem)
        node.setTextContent(serializedNode.text)
        node.setFormat(serializedNode.format)
        node.setDetail(serializedNode.detail)
        node.setMode(serializedNode.mode)
        node.setStyle(serializedNode.style)
        node.isFromInitialContext = serializedNode.isFromInitialContext
        return node
    }

    private contextItem: SerializedContextItem

    constructor(
        contextItemWithAllFields: ContextItem | SerializedContextItem,
        text?: string,
        key?: NodeKey,
        public isFromInitialContext = false
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
            isFromInitialContext: this.isFromInitialContext,
            type: ContextItemMentionNode.getType(),
            version: 1,
        }
    }

    private static CLASS_NAMES = `context-item-mention-node ${styles.contextItemMentionNode}`

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = ContextItemMentionNode.CLASS_NAMES

        if (this.contextItem.type === 'repository') {
            dom.title = `Repository: ${this.contextItem.repoName ?? this.contextItem.title ?? 'unknown'}`
        } else if (this.contextItem.type === 'tree') {
            dom.title = this.contextItem.title || 'Local workspace'
        } else if (this.contextItem.type === 'file') {
            dom.title = this.contextItem.isTooLarge
                ? 'This file is too large. Try readding it with line range.'
                : displayPath(URI.parse(this.contextItem.uri))
        }

        return dom
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
    const rangeText = contextItem.range?.start ? `:${displayLineRange(contextItem.range)}` : ''
    switch (contextItem.type) {
        case 'file':
            if (contextItem.provider && contextItem.title) {
                return contextItem.title
            }

            return `@${decodeURIComponent(displayPathBasename(URI.parse(contextItem.uri)))}${rangeText}`

        case 'repository':
            return `@${trimCommonRepoNamePrefixes(contextItem.repoName) ?? 'unknown repository'}`

        case 'tree':
            return `@${contextItem.name ?? 'unknown folder'}`

        case 'symbol':
            return `@${contextItem.symbolName}`

        case 'openctx':
            return `@${contextItem.mention?.data?.mentionLabel || contextItem.title}`
    }
    // @ts-ignore
    throw new Error(`unrecognized context item type ${contextItem.type}`)
}

function trimCommonRepoNamePrefixes(repoName: string): string {
    return repoName.replace(/^(github|gitlab)\.com\//, '')
}

export function $createContextItemMentionNode(
    contextItem: ContextItem | SerializedContextItem,
    { isFromInitialContext }: { isFromInitialContext: boolean } = { isFromInitialContext: false }
): ContextItemMentionNode {
    const node = new ContextItemMentionNode(contextItem, undefined, undefined, isFromInitialContext)
    node.setMode('token').toggleDirectionless()
    if (contextItem.type === 'file' && (contextItem.isTooLarge || contextItem.isIgnored)) {
        node.setStyle('text-decoration: line-through; color: var(--vscode-editorWarning-foreground)')
    }
    if (contextItem.type === 'repository' || contextItem.type === 'tree') {
        node.setStyle('font-weight: bold')
    }
    return $applyNodeReplacement(node)
}

export function $createContextItemTextNode(contextItem: ContextItem | SerializedContextItem): TextNode {
    const atNode = new ContextItemMentionNode(contextItem)
    const textNode = new TextNode(atNode.__text)
    return $applyNodeReplacement(textNode)
}

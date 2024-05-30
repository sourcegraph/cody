import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    type ContextItemSymbol,
    type ContextItemTree,
    displayLineRange,
    displayPathBasename,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'
import type { SerializedLexicalNode, Spread } from 'lexical'
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
import { Database, File, FolderGit, Link, SquareFunction, createElement } from 'lucide'
import { URI } from 'vscode-uri'
import RemoteFileProvider from '../../../src/context/openctx/remoteFileSearch'
import RemoteRepositorySearch from '../../../src/context/openctx/remoteRepositorySearch'
import WebProvider from '../../../src/context/openctx/web'
import styles from './ContextItemMentionNode.module.css'

export const MENTION_CLASS_NAME = styles.contextItemMentionNode

/**
 * The subset of {@link ContextItem} fields that we need to store to identify and display context
 * item mentions.
 */
export type SerializedContextItem = { uri: string; title?: string; content?: undefined } & (
    | Omit<ContextItemFile, 'uri' | 'content'>
    | Omit<ContextItemRepository, 'uri' | 'content'>
    | Omit<ContextItemTree, 'uri' | 'content'>
    | Omit<ContextItemSymbol, 'uri' | 'content'>
    | Omit<ContextItemOpenCtx, 'uri' | 'content'>
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
    return { ...contextItem, uri: URI.parse(contextItem.uri) } as ContextItem
}

export type SerializedContextItemMentionNode = Spread<
    { contextItem: SerializedContextItem; isFromInitialContext: boolean },
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
        const dom = document.createElement('span')
        const inner = super.createDOM(config)
        inner.innerText = ' ' + inner.innerText
        dom.appendChild(inner)
        dom.className = ContextItemMentionNode.CLASS_NAMES

        const icon = mentionIconForContextItem(this.contextItem)
        if (icon) {
            dom.insertBefore(icon, inner)
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

            return `${decodeURIComponent(displayPathBasename(URI.parse(contextItem.uri)))}${rangeText}`

        case 'repository':
            return `@repo:${contextItem.title}`

        case 'tree':
            return `@tree:${contextItem.title}`

        case 'symbol':
            return contextItem.symbolName

        case 'openctx':
            return `${contextItem.mention?.data?.mentionLabel || contextItem.title}`
    }
    // @ts-ignore
    throw new Error(`unrecognized context item type ${contextItem.type}`)
}

export function $createContextItemMentionNode(
    contextItem: ContextItem | SerializedContextItem,
    { isFromInitialContext }: { isFromInitialContext: boolean } = { isFromInitialContext: false }
): ContextItemMentionNode {
    const node = new ContextItemMentionNode(contextItem, undefined, undefined, isFromInitialContext)
    node.setMode('token').toggleDirectionless()
    contextItem.type === 'file' &&
        (contextItem.isTooLarge || contextItem.isIgnored) &&
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

type Icon = Parameters<typeof createElement>[0]
const CONTEXT_ITEM_ICONS: Partial<Record<string, Icon>> = {
    file: File,
    tree: FolderGit,
    repository: FolderGit,
    symbol: SquareFunction,
    [RemoteRepositorySearch.providerUri]: FolderGit,
    [RemoteFileProvider.providerUri]: File,
    [WebProvider.providerUri]: Link,
}
function mentionIconForContextItem(contextItem: SerializedContextItem): SVGElement | null {
    let icon: Icon | null | undefined = null

    icon =
        (contextItem.type === 'openctx'
            ? CONTEXT_ITEM_ICONS[contextItem.providerUri || '']
            : CONTEXT_ITEM_ICONS[contextItem.type]) || Database

    if (!icon) {
        return null
    }

    const svgEl = createElement(icon)
    svgEl.classList.add(styles.icon)
    svgEl.setAttribute('stroke', 'currentColor')
    svgEl.setAttribute('width', '13px')
    svgEl.setAttribute('height', '13px')
    return svgEl
}

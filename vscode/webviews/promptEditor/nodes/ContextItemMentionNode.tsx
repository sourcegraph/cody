import {
    CONTEXT_ITEM_MENTION_CHIP_NODE_TYPE,
    CONTEXT_ITEM_MENTION_TEXT_NODE_TYPE,
    type ContextItem,
    ContextItemSource,
    type SerializedContextItem,
    type SerializedContextItemMentionNode,
    type SerializedContextItemMentionTextNode,
    contextItemMentionNodeDisplayText,
    displayPath,
    serializeContextItem,
    webviewOpenURIForContextItem,
} from '@sourcegraph/cody-shared'
import {
    $applyNodeReplacement,
    type DOMConversionMap,
    type DOMConversionOutput,
    type DOMExportOutput,
    DecoratorNode,
    type EditorConfig,
    type LexicalEditor,
    type LexicalNode,
    type NodeKey,
    TextNode,
} from 'lexical'
import { URI } from 'vscode-uri'
import styles from './ContextItemMentionNode.module.css'
import { MentionComponent } from './MentionComponent'

export const MENTION_CLASS_NAME = styles.contextItemMentionNode

function convertContextItemMentionElement(domNode: HTMLElement): DOMConversionOutput | null {
    const data = domNode.getAttribute(DOM_DATA_ATTR)
    if (data !== null) {
        try {
            const contextItem: SerializedContextItem = JSON.parse(data)
            const node = $createContextItemMentionNode(contextItem, { isFromInitialContext: false })
            return { node }
        } catch (error) {
            console.error(error)
            return null
        }
    }

    return null
}

const DOM_DATA_ATTR = 'data-lexical-context-item-mention'

const MENTION_NODE_CLASS_NAME = `context-item-mention-node ${MENTION_CLASS_NAME}`

/**
 * New-style "chip" mention node.
 */
export class ContextItemMentionNode extends DecoratorNode<JSX.Element> {
    static getType(): typeof CONTEXT_ITEM_MENTION_CHIP_NODE_TYPE {
        return CONTEXT_ITEM_MENTION_CHIP_NODE_TYPE
    }

    static clone(node: ContextItemMentionNode): ContextItemMentionNode {
        return new ContextItemMentionNode(node.contextItem, node.isFromInitialContext, node.key)
    }

    public readonly contextItem: SerializedContextItem

    constructor(
        contextItemWithAllFields: ContextItem | SerializedContextItem,
        public readonly isFromInitialContext: boolean,
        private key?: NodeKey
    ) {
        super(key)
        this.contextItem = serializeContextItem(contextItemWithAllFields)
    }

    createDOM(): HTMLElement {
        return document.createElement('span')
    }

    updateDOM(): boolean {
        return false
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute(DOM_DATA_ATTR, JSON.stringify(this.contextItem))
        element.className = MENTION_NODE_CLASS_NAME
        element.textContent = this.getTextContent()
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

    static importJSON(serializedNode: SerializedContextItemMentionNode): ContextItemMentionNode {
        return $createContextItemMentionNode(serializedNode.contextItem, {
            isFromInitialContext: serializedNode.isFromInitialContext,
        })
    }

    exportJSON(): SerializedContextItemMentionNode {
        return {
            contextItem: serializeContextItem(this.contextItem),
            isFromInitialContext: this.isFromInitialContext,
            type: ContextItemMentionNode.getType(),
            text: this.getTextContent(),
            version: 1,
        }
    }

    getTextContent(): string {
        return contextItemMentionNodeDisplayText(this.contextItem)
    }

    decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
        return (
            <MentionComponent
                nodeKey={this.getKey()}
                node={this}
                className={`${MENTION_NODE_CLASS_NAME} ${extraClassNamesForContextItem(
                    this.contextItem
                )}`}
                focusedClassName={styles.contextItemMentionChipNodeFocused}
            />
        )
    }
}

/**
 * Old-style text mention node.
 */
export class ContextItemMentionTextNode extends TextNode {
    static getType(): typeof CONTEXT_ITEM_MENTION_TEXT_NODE_TYPE {
        return CONTEXT_ITEM_MENTION_TEXT_NODE_TYPE
    }

    static clone(node: ContextItemMentionTextNode): ContextItemMentionTextNode {
        return new ContextItemMentionTextNode(
            node.contextItem,
            node.__text,
            node.__key,
            node.isFromInitialContext
        )
    }

    static importJSON(serializedNode: SerializedContextItemMentionTextNode): ContextItemMentionTextNode {
        const node = $createContextItemMentionTextNode(serializedNode.contextItem, {
            isFromInitialContext: serializedNode.isFromInitialContext,
        })
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
        key?: NodeKey,
        public readonly isFromInitialContext = false
    ) {
        // Make sure we only bring over the fields on the context item that we need, or else we
        // could accidentally include tons of data (including the entire contents of files).
        const contextItem = serializeContextItem(contextItemWithAllFields)

        super(text ?? `@${contextItemMentionNodeDisplayText(contextItem)}`, key)

        this.contextItem = contextItem
    }

    exportJSON(): SerializedContextItemMentionTextNode {
        return {
            ...super.exportJSON(),
            contextItem: serializeContextItem(this.contextItem),
            isFromInitialContext: this.isFromInitialContext ?? false,
            type: ContextItemMentionTextNode.getType(),
            version: 1,
        }
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = `${MENTION_NODE_CLASS_NAME} ${extraClassNamesForContextItem(this.contextItem)}`

        if (this.contextItem.type === 'repository') {
            dom.title = `Repository: ${this.contextItem.repoName ?? this.contextItem.title ?? 'unknown'}`
        } else if (this.contextItem.type === 'tree') {
            dom.title = this.contextItem.title || 'Local workspace'
        } else if (this.contextItem.type === 'file') {
            dom.title = this.contextItem.isTooLarge
                ? this.contextItem.source === ContextItemSource.Initial
                    ? 'File is too large. Select a smaller range of lines from the file.'
                    : 'File is too large. Try adding the file again with a smaller range of lines.'
                : displayPath(URI.parse(this.contextItem.uri))
        } else if (this.contextItem.type === 'openctx') {
            dom.title = this.contextItem.uri
        }

        return dom
    }

    exportDOM(): DOMExportOutput {
        const element = document.createElement('span')
        element.setAttribute(DOM_DATA_ATTR, JSON.stringify(this.contextItem))
        element.className = MENTION_NODE_CLASS_NAME

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

export function $isContextItemMentionNode(
    node: LexicalNode | null | undefined
): node is ContextItemMentionNode {
    return node instanceof ContextItemMentionNode
}

export function $createContextItemMentionNode(
    contextItem: ContextItem | SerializedContextItem,
    { isFromInitialContext }: { isFromInitialContext: boolean } = { isFromInitialContext: false }
): ContextItemMentionNode {
    const node = new ContextItemMentionNode(contextItem, isFromInitialContext)
    return $applyNodeReplacement(node)
}

function $createContextItemMentionTextNode(
    contextItem: ContextItem | SerializedContextItem,
    { isFromInitialContext }: { isFromInitialContext: boolean } = { isFromInitialContext: false }
): ContextItemMentionTextNode {
    const node = new ContextItemMentionTextNode(contextItem, undefined, undefined, isFromInitialContext)
    node.setMode('token').toggleDirectionless()
    return $applyNodeReplacement(node)
}

function extraClassNamesForContextItem(contextItem: ContextItem | SerializedContextItem): string {
    const classNames: string[] = []
    if (contextItem.isTooLarge || contextItem.isIgnored) {
        classNames.push(styles.isTooLargeOrIgnored)
    }
    if (contextItem.type === 'repository' || contextItem.type === 'tree') {
        classNames.push(styles.strong)
    }
    return classNames.join(' ')
}

export function $createContextItemTextNode(contextItem: ContextItem | SerializedContextItem): TextNode {
    const atNode = new ContextItemMentionTextNode(contextItem)
    const textNode = new TextNode(atNode.__text)
    return $applyNodeReplacement(textNode)
}

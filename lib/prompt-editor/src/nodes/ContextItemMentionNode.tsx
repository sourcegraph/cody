import {
    CONTEXT_ITEM_MENTION_NODE_TYPE,
    type ContextItem,
    ContextItemSource,
    FILE_CONTEXT_MENTION_PROVIDER,
    REMOTE_REPOSITORY_PROVIDER_URI,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    type SerializedContextItem,
    type SerializedContextItemMentionNode,
    contextItemMentionNodeDisplayText,
    displayPath,
    serializeContextItem,
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
import { AtSignIcon } from 'lucide-react'
import { URI } from 'vscode-uri'
import { iconForProvider } from '../mentions/mentionMenu/MentionMenuItem'
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
    static getType(): typeof CONTEXT_ITEM_MENTION_NODE_TYPE {
        return CONTEXT_ITEM_MENTION_NODE_TYPE
    }

    static clone(node: ContextItemMentionNode): ContextItemMentionNode {
        return new ContextItemMentionNode(
            node.contextItem,
            node.isFromInitialContext,
            node.key ?? node.__key
        )
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

    private getTooltip(): string | undefined {
        if (this.contextItem.type === 'repository') {
            return `Repository: ${this.contextItem.repoName ?? this.contextItem.title ?? 'unknown'}`
        }
        if (this.contextItem.type === 'tree') {
            return this.contextItem.title || 'Local workspace'
        }
        if (this.contextItem.type === 'file') {
            return this.contextItem.isTooLarge
                ? this.contextItem.source === ContextItemSource.Initial
                    ? 'File is too large. Select a smaller range of lines from the file.'
                    : 'File is too large. Try adding the file again with a smaller range of lines.'
                : displayPath(URI.parse(this.contextItem.uri))
        }
        if (this.contextItem.type === 'openctx') {
            return this.contextItem.uri
        }
        return undefined
    }

    decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
        return (
            <MentionComponent
                nodeKey={this.getKey()}
                node={this}
                tooltip={this.getTooltip()}
                icon={iconForContextItem(this.contextItem)}
                className={`${MENTION_NODE_CLASS_NAME} ${extraClassNamesForContextItem(
                    this.contextItem
                )}`}
                focusedClassName={styles.contextItemMentionChipNodeFocused}
                iconClassName={styles.icon}
            />
        )
    }
}

function iconForContextItem(contextItem: SerializedContextItem): React.ComponentType<{
    size?: string | number
    strokeWidth?: string | number
    className?: string
}> {
    const providerUri =
        contextItem.type === 'file'
            ? FILE_CONTEXT_MENTION_PROVIDER.id
            : contextItem.type === 'symbol'
              ? SYMBOL_CONTEXT_MENTION_PROVIDER.id
              : contextItem.type === 'repository' || contextItem.type === 'tree'
                ? REMOTE_REPOSITORY_PROVIDER_URI
                : contextItem.providerUri
    return iconForProvider[providerUri] ?? AtSignIcon
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

function extraClassNamesForContextItem(contextItem: ContextItem | SerializedContextItem): string {
    const classNames: string[] = []
    if (contextItem.isTooLarge || contextItem.isIgnored) {
        classNames.push(styles.isTooLargeOrIgnored)
    }
    return classNames.join(' ')
}

export function $createContextItemTextNode(contextItem: ContextItem): TextNode {
    const textNode = new TextNode(contextItemMentionNodeDisplayText(serializeContextItem(contextItem)))
    return $applyNodeReplacement(textNode)
}

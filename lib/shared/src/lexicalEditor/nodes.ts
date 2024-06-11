import type { SerializedLexicalNode, SerializedTextNode, Spread } from 'lexical'
import { URI } from 'vscode-uri'
import type {
    ContextItem,
    ContextItemFile,
    ContextItemOpenCtx,
    ContextItemRepository,
    ContextItemSymbol,
    ContextItemTree,
} from '../codebase-context/messages'

export const CONTEXT_ITEM_MENTION_NODE_TYPE = 'contextItemMention'

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

export type SerializedContextItemMentionNode = Spread<
    {
        type: typeof CONTEXT_ITEM_MENTION_NODE_TYPE
        contextItem: SerializedContextItem
        isFromInitialContext: boolean
    },
    SerializedTextNode
>

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

export function isSerializedContextItemMentionNode(
    node: SerializedLexicalNode | null | undefined
): node is SerializedContextItemMentionNode {
    return Boolean(node && node.type === CONTEXT_ITEM_MENTION_NODE_TYPE)
}

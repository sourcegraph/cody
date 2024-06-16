import { CodeHighlightNode, CodeNode } from '@lexical/code'
import { ContextItemMentionNode, ContextItemMentionTextNode } from './ContextItemMentionNode'

export const RICH_EDITOR_NODES = [
    ContextItemMentionNode,
    ContextItemMentionTextNode,
    CodeNode,
    CodeHighlightNode,
]

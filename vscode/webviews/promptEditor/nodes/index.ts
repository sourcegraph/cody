import { CodeHighlightNode, CodeNode } from '@lexical/code'
import { InitialContextAnchorNode } from '../../chat/cells/messageCell/human/editor/initialContext'
import { ContextItemMentionNode } from './ContextItemMentionNode'

export const RICH_EDITOR_NODES = [
    ContextItemMentionNode,
    CodeNode,
    CodeHighlightNode,
    InitialContextAnchorNode,
]

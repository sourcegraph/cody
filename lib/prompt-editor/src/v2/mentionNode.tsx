import { createRoot, type Root } from 'react-dom/client'
import type { Node } from 'prosemirror-model'
import { FILE_CONTEXT_MENTION_PROVIDER, REMOTE_REPOSITORY_PROVIDER_URI, SerializedContextItem, SYMBOL_CONTEXT_MENTION_PROVIDER } from '@sourcegraph/cody-shared'
import { iconForProvider } from '../mentions/mentionMenu/MentionMenuItem'
import { AtSignIcon } from 'lucide-react'
import styles from './BaseEditor.module.css'
import { NodeView } from 'prosemirror-view'

export class MentionView implements NodeView {
    public dom: HTMLElement
    private root: Root

    constructor(node: Node) {
        const item = node.attrs.item as SerializedContextItem
        this.dom = document.createElement('span')
        this.dom.className = styles.mention
        this.root = createRoot(this.dom)
        this.root.render(<MentionChip item={item}>{node.content.firstChild?.text ?? ''}</MentionChip>)
    }

    stopEvents() {
        return true
    }

    selectNode() {
        this.dom.classList.add(styles.mentionFocused)
    }

    deselectNode() {
        this.dom.classList.remove(styles.mentionFocused)
    }

    destroy() {
        window.queueMicrotask(() => this.root.unmount())

    }
}

function iconForContextItem(item: SerializedContextItem): React.ComponentType {
    let providerURI = 'unknown'
    switch (item.type) {
        case 'file':
            providerURI = FILE_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'symbol':
            providerURI = SYMBOL_CONTEXT_MENTION_PROVIDER.id
            break;
        case 'repository':
        case 'tree':
            REMOTE_REPOSITORY_PROVIDER_URI
            break
        case 'openctx':
            providerURI = item.providerUri
            break
    }

    return iconForProvider[providerURI] ?? AtSignIcon
}

interface MentionChipProps {
    item: SerializedContextItem
    children: string
}

const MentionChip: React.FC<MentionChipProps> = props => {
    const Icon = iconForContextItem(props.item)
    return <>
        {Icon && <Icon />}
        <span>{props.children}</span>
    </>
}

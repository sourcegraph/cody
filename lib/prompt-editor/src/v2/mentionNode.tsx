import { createRoot, type Root } from 'react-dom/client'
import type { Node } from 'prosemirror-model'
import { displayPathBasename, FILE_CONTEXT_MENTION_PROVIDER, REMOTE_REPOSITORY_PROVIDER_URI, SYMBOL_CONTEXT_MENTION_PROVIDER, type ContextItem, type ContextMentionProviderMetadata } from '@sourcegraph/cody-shared'
import { iconForProvider } from '../mentions/mentionMenu/MentionMenuItem'
import { AtSignIcon } from 'lucide-react'
import styles from './BaseEditor.module.css'

export class MentionView {
    public dom: HTMLElement
    private root: Root

    constructor(node: Node) {
        const item = node.attrs.item as ContextItem
        this.dom = document.createElement('span')
        this.dom.className = styles.mention
        this.root = createRoot(this.dom)
        this.root.render(<MentionChip item={item} />)
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
        this.root.unmount()
    }
}

function getItemTitle(item: ContextItem|ContextMentionProviderMetadata): string {
    if ('id' in item) {
        return item.title
    }
    switch (item.type) {
        case 'symbol':
            return item.title ?? item.symbolName
        default:
            return item.title ?? displayPathBasename(item.uri)

    }
}

function iconForContextItem(item: ContextItem): React.ComponentType {
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
    item: ContextItem
}

const MentionChip: React.FC<MentionChipProps> = props => {
    const Icon = iconForContextItem(props.item)
    return <>
        {Icon && <Icon />}
        <span>{getItemTitle(props.item)}</span>
    </>
}

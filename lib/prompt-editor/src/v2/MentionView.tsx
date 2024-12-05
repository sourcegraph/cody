import { createRoot, type Root } from 'react-dom/client'
import type { Node } from 'prosemirror-model'
import { ContextItemSource, displayPath, FILE_CONTEXT_MENTION_PROVIDER, REMOTE_REPOSITORY_PROVIDER_URI, SerializedContextItem, SYMBOL_CONTEXT_MENTION_PROVIDER } from '@sourcegraph/cody-shared'
import { iconForProvider } from '../mentions/mentionMenu/MentionMenuItem'
import { AtSignIcon } from 'lucide-react'
import styles from './MentionView.module.css'
import { NodeView } from 'prosemirror-view'
import clsx from 'clsx'
import { URI } from 'vscode-uri'
import { useState } from 'react'
import { shift, size, useDismiss, useFloating, useHover, useInteractions } from '@floating-ui/react'

export class MentionView implements NodeView {
    public dom: HTMLElement
    private root: Root

    constructor(node: Node) {
        const item = node.attrs.item as SerializedContextItem
        this.dom = document.createElement('span')
        this.dom.className = clsx(
            styles.mention,
            {[styles.isTooLargeOrIngore]: item.isTooLarge || item.isIgnored}
        )
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

interface MentionChipProps {
    item: SerializedContextItem
    children: string
}

const MentionChip: React.FC<MentionChipProps> = props => {
    const [isOpen, setIsOpen] = useState(false)
    const tooltip = tooltipForContextItem(props.item)
    const enableTooltip = !!tooltip
    const {refs, floatingStyles, context} = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        strategy: 'fixed',
        placement: 'top',
        middleware: [shift(), size({
            apply({availableWidth, elements}) {
                elements.floating.style.maxWidth = `${availableWidth}px`
                elements.floating.style.wordBreak = 'break-word'
            },
        })]

    })
    const hover = useHover(context, {
        restMs: 500,
        enabled: enableTooltip,
        // Needed for dismiss to work properly on pointerdown
        move: false,
    })
    const dismiss = useDismiss(context, {
        enabled: enableTooltip,
        referencePress: true,
    })

    const {getReferenceProps, getFloatingProps} = useInteractions([hover, dismiss])

    const Icon = iconForContextItem(props.item)
    return <>
        <span ref={refs.setReference} {...getReferenceProps()}>
            {Icon && <Icon />}
            <span>{props.children}</span>
        </span>
        {isOpen &&
            <div
                ref={refs.setFloating}
                className="tw-z-50 tw-overflow-hidden tw-flex tw-items-center tw-rounded-md tw-border tw-border-border tw-leading-tight tw-bg-popover tw-px-3 tw-py-2 tw-text-sm tw-text-popover-foreground tw-max-w-72 tw-text-center tw-whitespace-pre-line tw-shadow-lg [&_kbd]:tw-ml-3 [&_kbd]:-tw-mr-1 [&_kbd]:tw-mt-[-4px] [&_kbd]:tw-mb-[-4px]"
                style={floatingStyles} {...getFloatingProps()}>{tooltip}</div>}
    </>
}

function tooltipForContextItem(item: SerializedContextItem): string|undefined {
    if (item.type === 'repository') {
        return `Repository: ${item.repoName ?? item.title ?? 'unknown'}`
    }
    if (item.type === 'tree') {
        return item.title || 'Local workspace'
    }
    if (item.type === 'file') {
        return item.isTooLarge
            ? item.source === ContextItemSource.Initial
                ? 'File is too large. Select a smaller range of lines from the file.'
                : 'File is too large. Try adding the file again with a smaller range of lines.'
            : displayPath(URI.parse(item.uri))
    }
    if (item.type === 'openctx') {
        return item.uri
    }
    return undefined
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


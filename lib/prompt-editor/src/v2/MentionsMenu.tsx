import { shift, size, useFloating } from '@floating-ui/react'
import clsx from 'clsx'
import { type MouseEventHandler, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import styles from './MentionsMenu.module.css'
import type { Position } from './atMention'

export interface Item<T> {
    data: T
}

interface MentionsMenuProps<T> {
    items: Item<T>[]
    selectedIndex: number
    menuPosition: Position
    getHeader: () => React.ReactNode
    getEmptyLabel: () => React.ReactNode
    onSelect?: (index: number) => void
    renderItem: (data: T) => React.ReactNode
}

export const MentionsMenu = <T,>({
    items,
    selectedIndex,
    menuPosition,
    getHeader,
    getEmptyLabel,
    onSelect,
    renderItem,
}: MentionsMenuProps<T>) => {
    const container = useRef<HTMLDivElement | null>(null)

    const { refs, floatingStyles } = useFloating({
        open: true,
        placement: 'bottom-start',
        middleware: [
            shift(),
            size({
                apply({ availableWidth, availableHeight, elements }) {
                    Object.assign(elements.floating.style, {
                        maxWidth: `${availableWidth}px`,
                        maxHeight: `${availableHeight}px`,
                    })
                },
            }),
        ],
    })

    useLayoutEffect(() => {
        refs.setPositionReference({
            getBoundingClientRect() {
                return {
                    width: 0,
                    height: 0,
                    y: menuPosition.bottom,
                    x: menuPosition.left,
                    top: menuPosition.bottom,
                    left: menuPosition.left,
                    right: menuPosition.left,
                    bottom: menuPosition.bottom,
                }
            },
        })
    }, [menuPosition, refs])

    useEffect(() => {
        // WORKAROUND: We want to scroll the selected item into view, but only when selectedIndex changes.
        // This statement was added to prevent biome from flagging that selectedIndex is not used.
        void selectedIndex
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    // Prevent input loosing focus
    const handleMouseDown: MouseEventHandler = useCallback(event => {
        event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(
        event => {
            const target = event.target as HTMLElement | null
            const listNode = target?.closest('li') as HTMLLIElement | null
            if (listNode?.parentNode) {
                const options = listNode.parentNode.querySelectorAll('[role="option"]')
                // @ts-expect-error - TS doesn't like this but it's OK
                const index = [].indexOf.call(options, listNode)
                if (index !== -1) {
                    onSelect?.(index)
                }
            }
        },
        [onSelect]
    )

    const header = getHeader()

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the menu works like a combobox and isn't directly contrallable via keyboard. The keyboard events are handled by the editor.
        <div
            ref={node => {
                container.current = node
                refs.setFloating(node)
            }}
            className={clsx(styles.menu, styles.popoverDimensions, menuClass)}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            style={floatingStyles}
        >
            {header && <div className={headerClass}>{header}</div>}
            <div role="listbox">
                {items.map((item, index) => (
                    <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: we render only very few items, this is fine
                        key={index}
                        role="option"
                        className={itemClass}
                        aria-selected={index === selectedIndex}
                    >
                        {renderItem(item.data)}
                    </div>
                ))}
            </div>
            {items.length === 0 && (
                <div className={itemClass} data-disabled="true">
                    {getEmptyLabel()}
                </div>
            )}
        </div>
    )
}

const headerClass =
    '!tw-p-0 !tw-border-b-0 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] tw-opacity-50'

const menuClass = 'tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground'

const itemClass =
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'

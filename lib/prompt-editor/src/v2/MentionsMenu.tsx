import { offset, shift, size, useFloating } from '@floating-ui/react'
import clsx from 'clsx'
import { type MouseEventHandler, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import styles from './MentionsMenu.module.css'

interface MentionsMenuProps<T> {
    /**
     * The items to display in the menu.
     */
    items: T[]
    /**
     * The index of the currently selected item.
     */
    selectedIndex: number
    /**
     * The reference position for the menu, in screen coordinates.
     */
    menuPosition: { x: number; y: number }
    /**
     * A render prop for the header of the menu (if any). The header is shown
     * above the items.
     */
    getHeader: () => React.ReactNode
    /**
     * A render prop that returns the label to display when there are no items.
     */
    getEmptyLabel: () => React.ReactNode
    /**
     * A render prop for each item in the menu.
     */
    renderItem: (item: T) => React.ReactNode
    /**
     * A callback that is called when an item is selected. The callback is passed
     * the index of the clicked item in the `items` array.
     */
    onSelect?: (index: number) => void
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
            shift({
                padding: 8,
            }),
            offset({ mainAxis: 4 }),
            size({
                apply({ availableWidth, availableHeight, elements }) {
                    Object.assign(elements.floating.style, {
                        maxWidth: `${availableWidth}px`,
                        maxHeight: `${availableHeight}px`,
                    })
                },
                padding: 8,
            }),
        ],
    })

    useLayoutEffect(() => {
        // See https://floating-ui.com/docs/virtual-elements
        refs.setPositionReference({
            getBoundingClientRect() {
                return {
                    width: 0,
                    height: 0,
                    y: menuPosition.y,
                    x: menuPosition.x,
                    top: menuPosition.y,
                    bottom: menuPosition.y,
                    left: menuPosition.x,
                    right: menuPosition.x,
                }
            },
        })
    }, [menuPosition, refs])

    // biome-ignore lint/correctness/useExhaustiveDependencies(selectedIndex): we want to scroll the selected item into view but only when selectedIndex changes
    useEffect(() => {
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    // This prevents the input from loosing focus when clicking on the menu.
    const handleMouseDown: MouseEventHandler = useCallback(event => {
        event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(
        event => {
            const target = event.target as HTMLElement | null
            const listNode = target?.closest('[role=option]') as HTMLElement | null
            if (listNode?.parentNode) {
                const options = listNode.parentNode.querySelectorAll('[role="option"]')
                const index = Array.prototype.indexOf.call(options, listNode)
                if (index !== -1) {
                    onSelect?.(index)
                }
            }
        },
        [onSelect]
    )

    const header = getHeader()

    return (
        // biome-ignore lint/a11y/useKeyWithClickEvents: the menu works like a combobox and isn't directly contrallable via keyboard. The keyboard events are handled by the editor and the component is updated accordingly.
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
                        {renderItem(item)}
                    </div>
                ))}
            </div>
            {items.length === 0 && (
                <div className="tw-py-3 tw-px-2 tw-text-md tw-opacity-50">{getEmptyLabel()}</div>
            )}
        </div>
    )
}

const headerClass =
    '!tw-p-0 !tw-border-b-0 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] tw-opacity-50'

const menuClass =
    'tw-overflow-hidden tw-overflow-y-auto tw-rounded-md tw-bg-popover tw-text-popover-foreground'

const itemClass =
    'w-relative tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'

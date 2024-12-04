import { useEffect, useRef, MouseEventHandler, useCallback, useLayoutEffect } from "react"
import { shift, size, useFloating } from "@floating-ui/react"
import { Position } from "./atMention"
import styles from "./MentionsMenu.module.css"
import clsx from "clsx"

export interface Item<T> {
    data: T
}

interface SuggestionsProps<T> {
    items: Item<T>[]
    selectedIndex: number
    filter: string
    menuPosition: Position
    getHeader: () => React.ReactNode
    getEmptyLabel: (args: {filter: string}) => React.ReactNode
    onSelect?: (index: number) => void
    renderItem: (data: T) => React.ReactNode
}

export const Suggestions = <T,>({items, selectedIndex, filter, menuPosition, getHeader, getEmptyLabel, onSelect, renderItem}: SuggestionsProps<T>) => {
    const container = useRef<HTMLDivElement | null>(null)

    const {refs, floatingStyles} = useFloating({
        open: true,
        placement: 'bottom-start',
        middleware: [
            shift(),
            size({
                apply({availableWidth, availableHeight, elements}) {
                    Object.assign(elements.floating.style, {
                        maxWidth: `${availableWidth}px`,
                        maxHeight: `${availableHeight}px`,
                    })
                }
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
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [container, selectedIndex])

    // Prevent input loosing focus
    const handleMouseDown: MouseEventHandler = useCallback(event => {
            event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(event => {
        const target = event.target as HTMLElement|null
        const listNode = target?.closest('li') as HTMLLIElement | null
        if (listNode?.parentNode) {
            const options = listNode.parentNode.querySelectorAll('[role="option"]')
            // @ts-expect-error
            const index = [].indexOf.call(options, listNode)
            if (index !== -1) {
                onSelect?.(index)
            }
        }
    }, [])

    const header = getHeader()

    return <div
        ref={node => {
            container.current = node
            refs.setFloating(node)
        }}
        className={clsx(styles.menu, styles.popoverDimensions, menuClass)}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={floatingStyles}>
        <ul>
            {header &&
                <li className={headerClass} aria-disabled="true">{header}</li>
            }
            {items.map((item, index) =>
                <li key={index} role="option" className={itemClass} aria-selected={index === selectedIndex}>
                    {renderItem(item.data)}
                </li>
            )}
            {items.length === 0 && <li aria-disabled="true">{getEmptyLabel({filter})}</li>}
        </ul>
    </div>
}

const headerClass = '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)

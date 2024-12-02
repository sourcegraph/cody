import { useEffect, useRef, MouseEventHandler, useCallback } from "react"
import { Position } from "./atMention"
import { EditorState, Transaction } from "prosemirror-state"
import styles from "./BaseEditor.module.css"
import clsx from "clsx"

export interface Item<T> {
    data: T
    select(state: EditorState, dispatch: (tr: Transaction) => void, data: T): void
    // TODO: THis shouldn't be defined here
    render(data: T): JSX.Element|string
}

interface SuggestionsProps {
    items: Item<unknown>[]
    selectedIndex: number
    filter: string
    loading: boolean
    menuPosition: Position
    getHeader: () => React.ReactNode
    getEmptyLabel: (args: {filter: string}) => React.ReactNode
    onSelect?: (index: number) => void
}

export const Suggestions: React.FC<SuggestionsProps> = ({items, selectedIndex, filter, loading, menuPosition, getHeader, getEmptyLabel, onSelect}) => {
    const container = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    }, [container, selectedIndex])

    // Prevent input loosing focus
    const handleMouseDown: MouseEventHandler = useCallback(event => {
            event.preventDefault()
    }, [])

    const handleClick: MouseEventHandler = useCallback(event => {
        const listNode = event.target?.closest('li') as HTMLLIElement | null
        if (listNode?.parentNode) {
            const options = listNode.parentNode.querySelectorAll('[role="option"]')
            const index = [].indexOf.call(options, listNode)
            if (index !== -1) {
                onSelect?.(index)
            }
        }
    }, [])

    const header = getHeader()

    return <div
        ref={container}
        className={clsx(styles.suggestions, menuClass, { [styles.loading]: loading })}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ top: menuPosition.bottom, left: menuPosition.left }}>
        <ul>
            {header &&
                <li className={headerClass} aria-disabled="true">{header}</li>
            }
        {items.map((item, index) =>
            <li key={index} role="option" className={itemClass} aria-selected={index === selectedIndex}>
                {item.render(item.data)}
            </li>
        )}
            {loading && items.length === 0 && <li aria-disabled="true">Loading...</li>}
            {!loading && items.length === 0 && <li aria-disabled="true">{getEmptyLabel({filter})}</li>}
        </ul>
    </div>
}

const headerClass = '!tw-p-0 !tw-border-b-0 [&_[cmdk-group-heading]]:!tw-p-3 [&_[cmdk-group-heading]]:!tw-text-md [&_[cmdk-group-heading]]:!tw-leading-[1.2] [&_[cmdk-group-heading]]:!tw-h-[30px]'

const menuClass = ('tw-overflow-hidden tw-rounded-md tw-bg-popover tw-text-popover-foreground')

const itemClass = (
    'tw-relative tw-flex tw-cursor-pointer tw-select-none tw-items-center tw-py-3 tw-px-2 tw-text-md tw-outline-none aria-selected:tw-bg-accent aria-selected:tw-text-accent-foreground hover:tw-bg-accent hover:tw-text-accent-foreground data-[disabled=true]:tw-pointer-events-none data-[disabled=true]:tw-opacity-50 !tw-p-3 !tw-text-md !tw-leading-[1.2] !tw-h-[30px] !tw-rounded-none'
)

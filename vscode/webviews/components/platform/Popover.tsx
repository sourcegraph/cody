import { clsx } from 'clsx'
import {
    type FunctionComponent,
    type HTMLAttributes,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'
import styles from './Popover.module.css'

type Position = 'top-start' | 'top-end' | 'bottom-end'

/**
 * A popover that uses the HTML popover API.
 */
export const Popover: FunctionComponent<{
    anchor: HTMLElement | null
    position?: Position
    visible: boolean
    onMouseEnter?: () => void
    onMouseLeave?: () => void
    role?: HTMLAttributes<HTMLDialogElement>['role']
    className?: string
    children: ReactNode
}> = ({
    anchor,
    position = 'top-start',
    visible,
    onMouseEnter,
    onMouseLeave,
    role,
    className,
    children,
}) => {
    const popoverEl = useRef<HTMLDialogElement>(null)

    const [anchorWasFocused, setAnchorWasFocused] = useState(false)

    const showPopover = useCallback((): void => {
        if (!popoverEl.current || !anchor) {
            return
        }

        setAnchorWasFocused(document.activeElement === anchor)

        // Need to call showPopover before getPopoverDimensions because it needs to be displayed in
        // order to calculate its dimensions.
        popoverEl.current.showPopover()

        const { top, left, right } = getPopoverDimensions(position, anchor, popoverEl.current)
        popoverEl.current.style.top = top
        if (left !== undefined) popoverEl.current.style.left = left
        if (right !== undefined) popoverEl.current.style.right = right
    }, [anchor, position])
    const hidePopover = useCallback((): void => {
        if (!popoverEl.current || !anchor) {
            return
        }
        popoverEl.current.hidePopover()
        if (anchorWasFocused) {
            anchor.focus()
        }
    }, [anchor, anchorWasFocused])

    useEffect(() => {
        if (visible) {
            showPopover()
        } else {
            hidePopover()
        }
    }, [hidePopover, showPopover, visible])

    return (
        <aside
            popover="auto"
            role={role}
            ref={popoverEl}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={clsx(styles.popover, className)}
        >
            {visible ? children : null}
        </aside>
    )
}

// @types/react does not include the HTML popover attribute.
declare module 'react' {
    interface HTMLAttributes<T> {
        popover?: 'auto'
    }
}

type PRect = Partial<DOMRect> & {
    readonly bottom: number
    readonly height: number
    readonly left: number
    readonly right: number
    readonly top: number
    readonly width: number
}

function getPopoverDimensions(
    position: Position,
    targetEl: HTMLElement,
    popoverEl: HTMLElement
): { top: string; left?: string; right?: string } {
    const f =
        position === 'top-start'
            ? positionTopStart
            : position === 'top-end'
              ? positionTopEnd
              : positionBottomEnd
    return f(targetEl.getBoundingClientRect(), popoverEl.getBoundingClientRect())
}

function positionTopStart(targetRect: PRect, popoverRect: PRect): { top: string; left: string } {
    const { directionRight, directionDown } = getCollisions(targetRect, popoverRect)
    return {
        top: directionDown
            ? `${targetRect.top + targetRect.height + window.scrollY}px`
            : `${targetRect.top - popoverRect.height + window.scrollY}px`,
        left: directionRight
            ? `${targetRect.right - popoverRect.width + window.scrollX}px`
            : `${targetRect.left + window.scrollX}px`,
    }
}

function positionTopEnd(targetRect: PRect, popoverRect: PRect): { top: string; left: string } {
    const { directionRight, directionDown } = getCollisions(targetRect, popoverRect)
    return {
        top: directionDown
            ? `${targetRect.top + targetRect.height + window.scrollY}px`
            : `${targetRect.top - popoverRect.height + window.scrollY}px`,
        left: directionRight
            ? `${targetRect.right + window.scrollX}px`
            : `${targetRect.right - popoverRect.width + window.scrollX}px`,
    }
}

function positionBottomEnd(targetRect: PRect, popoverRect: PRect): { top: string; right: string } {
    const { directionRight, directionUp } = getCollisions(targetRect, popoverRect)
    return {
        top: directionUp
            ? `${targetRect.top - popoverRect.height + window.scrollY}px`
            : `${targetRect.top + targetRect.height + window.scrollY}px`,
        right: directionRight
            ? `${window.innerWidth - targetRect.left - popoverRect.width + window.scrollX}px`
            : `${window.innerWidth - targetRect.right + window.scrollX}px`,
    }
}

function getCollisions(
    targetRect: PRect,
    popoverRect: PRect,
    offsetLeft = 0,
    offsetBottom = 0
): {
    directionRight: boolean
    directionLeft: boolean
    directionUp: boolean
    directionDown: boolean
} {
    const collisions = {
        top: targetRect.top - popoverRect.height < 0,
        right: window.innerWidth < targetRect.left + popoverRect.width - offsetLeft,
        bottom: window.innerHeight < targetRect.bottom + popoverRect.height - offsetBottom,
        left: targetRect.left + targetRect.width - popoverRect.width < 0,
    }

    const directionRight = collisions.right && !collisions.left
    const directionLeft = collisions.left && !collisions.right
    const directionUp = collisions.bottom && !collisions.top
    const directionDown = collisions.top && !collisions.bottom

    return { directionRight, directionLeft, directionUp, directionDown }
}

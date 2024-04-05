import classNames from 'classnames'
import { type FunctionComponent, type ReactNode, useCallback, useEffect, useRef } from 'react'
import styles from './Popover.module.css'

/**
 * A popover that uses the HTML popover API.
 */
export const Popover: FunctionComponent<{
    anchor: HTMLElement
    visible: boolean
    onMouseEnter?: () => void
    onMouseLeave?: () => void
    className?: string
    children: ReactNode
}> = ({ anchor, visible, onMouseEnter, onMouseLeave, className, children }) => {
    const popoverEl = useRef<HTMLDialogElement>(null)

    const showPopover = useCallback((): void => {
        if (!popoverEl.current) {
            return
        }

        // Need to call showPopover before getPopoverDimensions because it needs to be displayed in
        // order to calculate its dimensions.
        popoverEl.current.showPopover()

        const { top, left } = getPopoverDimensions(anchor, popoverEl.current)
        popoverEl.current.style.top = top
        popoverEl.current.style.left = left
    }, [anchor])
    const hidePopover = useCallback((): void => {
        if (!popoverEl.current) {
            return
        }
        popoverEl.current.hidePopover()
    }, [])

    useEffect(() => {
        if (visible) {
            showPopover()
        } else {
            hidePopover()
        }
    }, [hidePopover, showPopover, visible])

    return (
        <dialog
            popover="auto"
            ref={popoverEl}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={classNames(styles.popover, className)}
        >
            {children}
        </dialog>
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
    targetEl: HTMLElement,
    popoverEl: HTMLElement
): { top: string; left: string } {
    return positionTopStart(targetEl.getBoundingClientRect(), popoverEl.getBoundingClientRect())
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

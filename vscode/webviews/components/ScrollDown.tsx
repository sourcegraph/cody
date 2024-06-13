import { ArrowDownIcon } from 'lucide-react'
import { type FC, useCallback, useEffect, useState } from 'react'
import { Button } from './shadcn/ui/button'

const MARGIN = 200 /* px */

interface ScrollDownProps {
    scrollableParent?: HTMLElement | null
    onClick?: () => void
}

/**
 * A component that displays a down arrow at the bottom of the viewport to inform the user that
 * there is more content if they scroll down.
 */
export const ScrollDown: FC<ScrollDownProps> = props => {
    const { scrollableParent , onClick: parentOnClick } = props
    const [canScrollDown, setCanScrollDown] = useState(false)

    const scrollableRoot = scrollableParent ?? window.document.body

    useEffect(() => {
        function handleScroll() {
            const scrollPosition = scrollableRoot.scrollTop
            const scrollHeight = scrollableRoot.scrollHeight
            const clientHeight = scrollableRoot.getBoundingClientRect().height
            setCanScrollDown(scrollPosition + clientHeight < scrollHeight - MARGIN)
        }
        handleScroll()
        scrollableRoot.addEventListener('scroll', handleScroll)
        scrollableRoot.addEventListener('resize', handleScroll)

        const resizeObserver = new ResizeObserver(() => {
            handleScroll()
        })
        resizeObserver.observe(scrollableRoot)

        return () => {
            scrollableRoot.removeEventListener('scroll', handleScroll)
            scrollableRoot.removeEventListener('resize', handleScroll)
            resizeObserver.disconnect()
        }
    }, [])

    const onClick = useCallback(() => {
        setCanScrollDown(false) // immediately hide to avoid jitter
        scrollableRoot.scrollTo({
            top: scrollableRoot.scrollHeight,
        })
        parentOnClick?.()
    }, [parentOnClick])

    return canScrollDown ? (
        <div className="tw-sticky tw-bottom-0 tw-w-full tw-text-center tw-py-4">
            <Button
                variant="outline"
                size="lg"
                onClick={onClick}
                className="tw-py-3 hover:tw-bg-secondary"
            >
                <ArrowDownIcon size={24} />
            </Button>
        </div>
    ) : null
}

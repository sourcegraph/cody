import { ArrowDownIcon } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from './shadcn/ui/button'

const MARGIN = 200 /* px */

interface Scroller {
    root: HTMLElement
    getObserveElement: () => Element
    getScrollTop: () => number
    getScrollHeight: () => number
    getClientHeight: () => number
}

function createScrollerAPI(element: HTMLElement): Scroller {
    return {
        root: element,
        getObserveElement: () => element.firstElementChild!,
        getScrollTop: () => element.scrollTop,
        getScrollHeight: () => element.scrollHeight,
        getClientHeight: () => element.getBoundingClientRect().height,
    }
}

interface ScrollDownProps {
    scrollableParent: HTMLElement
    onClick?: () => void
}

/**
 * A component that displays a down arrow at the bottom of the viewport to inform the user that
 * there is more content if they scroll down.
 */
export const ScrollDown: FC<ScrollDownProps> = props => {
    const { scrollableParent, onClick: parentOnClick } = props
    const [canScrollDown, setCanScrollDown] = useState(false)

    const scrollerAPI = useMemo(() => createScrollerAPI(scrollableParent), [scrollableParent])

    useEffect(() => {
        function calculateScrollState() {
            const scrollTop = scrollerAPI.getScrollTop()
            const scrollHeight = scrollerAPI.getScrollHeight()
            const clientHeight = scrollerAPI.getClientHeight()

            setCanScrollDown(scrollTop + clientHeight < scrollHeight - MARGIN)
        }

        calculateScrollState()

        const resizeObserver = new ResizeObserver(() => {
            calculateScrollState()
        })

        resizeObserver.observe(scrollerAPI.getObserveElement())
        scrollerAPI.root.addEventListener('scroll', calculateScrollState)

        return () => {
            resizeObserver.disconnect()
            scrollerAPI.root.removeEventListener('scroll', calculateScrollState)
        }
    }, [scrollerAPI])

    const onClick = useCallback(() => {
        setCanScrollDown(false) // immediately hide to avoid jitter
        scrollerAPI.root.scrollTo({
            top: scrollerAPI.getScrollHeight(),
        })
        parentOnClick?.()
    }, [parentOnClick, scrollerAPI])

    return canScrollDown ? (
        <div className="tw-bottom-0 tw-left-1/2 tw-inline-block tw-sticky tw--translate-x-1/2 tw-pb-40 md:tw-pb-48 tw-w-fit">
            <Button
                variant="outline"
                size="sm"
                onClick={onClick}
                className="tw-rounded-full tw-py-3 tw-my-4 tw hover:tw-bg-primary-hover"
            >
                <ArrowDownIcon size={16} /> Skip to end
            </Button>
        </div>
    ) : null
}

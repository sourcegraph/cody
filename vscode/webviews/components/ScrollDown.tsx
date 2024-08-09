import { ArrowDownIcon } from 'lucide-react'
import { type FC, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from './shadcn/ui/button'

const MARGIN = 200 /* px */

interface Scroller {
    root: HTMLElement | Window
    getObserveElement: () => Element
    getScrollTop: () => number
    getScrollHeight: () => number
    getClientHeight: () => number
}

// Chat UI could be run in different modes, in VSCode the whole chat
// is rendered within scrollable iframe, and it scrolls down button should
// listen and work with window updates,In Cody Web (and possible in other
// clients) chat might be rendered in arbitrary scrollable element.
// This Scroller API helps to observe complexity of both cases and provides
// unified API to work with different root elements.
function createScrollerAPI(element: HTMLElement | null | undefined): Scroller {
    if (element) {
        return {
            root: element,
            getObserveElement: () => element.children[0],
            getScrollTop: () => element.scrollTop,
            getScrollHeight: () => element.scrollHeight,
            getClientHeight: () => element.getBoundingClientRect().height,
        }
    }

    return {
        root: window,
        getObserveElement: () => window.document.body,
        getScrollTop: () => window.scrollY,
        getScrollHeight: () => window.document.body.scrollHeight,
        getClientHeight: () => window.innerHeight,
    }
}

interface ScrollDownProps {
    scrollableParent?: HTMLElement | null
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
        function handleScroll() {
            const scrollPosition = scrollerAPI.getScrollTop()
            const scrollHeight = scrollerAPI.getScrollHeight()
            const clientHeight = scrollerAPI.getClientHeight()
            setCanScrollDown(scrollPosition + clientHeight < scrollHeight - MARGIN)
        }
        handleScroll()
        scrollerAPI.root.addEventListener('scroll', handleScroll)
        scrollerAPI.root.addEventListener('resize', handleScroll)

        const resizeObserver = new ResizeObserver(() => {
            handleScroll()
        })
        resizeObserver.observe(scrollerAPI.getObserveElement())

        return () => {
            scrollerAPI.root.removeEventListener('scroll', handleScroll)
            scrollerAPI.root.removeEventListener('resize', handleScroll)
            resizeObserver.disconnect()
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
        <div className="tw-sticky tw-bottom-0 tw-w-full tw-text-center tw-py-4">
            <Button
                variant="outline"
                size="lg"
                onClick={onClick}
                className="tw-py-3 hover:tw-bg-primary-hover"
            >
                <ArrowDownIcon size={24} />
            </Button>
        </div>
    ) : null
}

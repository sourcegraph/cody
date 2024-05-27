import { ArrowDownIcon } from 'lucide-react'
import { type FunctionComponent, type RefObject, useCallback, useEffect, useState } from 'react'
import { Button } from './shadcn/ui/button'

const MARGIN = 300 /* px */

/**
 * A component that displays a down arrow at the bottom of the viewport to inform the user that
 * there is more content if they scroll down.
 */
export const ScrollDown: FunctionComponent<{ scrollContainerRef: RefObject<HTMLElement> }> = ({
    scrollContainerRef,
}) => {
    const [canScrollDown, setCanScrollDown] = useState(false)
    console.log({ canScrollDown }, scrollContainerRef)

    useEffect(() => {
        const scrollContainer = scrollContainerRef.current ?? document.querySelector('#foo')
        if (!scrollContainer) {
            return
        }

        function handleScroll() {
            if (scrollContainer) {
                const scrollPosition = scrollContainer.scrollTop
                const scrollHeight = scrollContainer.scrollHeight
                const clientHeight = scrollContainer.clientHeight
                setCanScrollDown(scrollPosition + clientHeight < scrollHeight - MARGIN)
            }
        }
        handleScroll()
        scrollContainer.addEventListener('scroll', handleScroll)
        window.addEventListener('resize', handleScroll)

        const intersectionObserver = new IntersectionObserver(
            entries => {
                console.log('XXX')
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        handleScroll()
                    }
                }
            },
            { threshold: 0.1 }
        )
        intersectionObserver.observe(scrollContainer)

        const resizeObserver = new ResizeObserver(args => {
            console.log('RESIZE', args)
            handleScroll()
        })
        resizeObserver.observe(scrollContainer)

        return () => {
            scrollContainer.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleScroll)
            intersectionObserver.disconnect()
            resizeObserver.disconnect()
        }
    }, [scrollContainerRef])

    const scrollDown = useCallback(() => {
        scrollContainerRef.current?.scrollTo({
            top: scrollContainerRef.current?.scrollHeight,
            behavior: 'smooth',
        })
    }, [scrollContainerRef])

    return canScrollDown ? (
        <div className="tw-sticky tw-bottom-0 tw-w-full tw-text-center tw-py-4">
            <Button variant="outline" size="lg" onClick={scrollDown} className="tw-py-3">
                <ArrowDownIcon size={24} />
            </Button>
        </div>
    ) : null
}

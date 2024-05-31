import { ArrowDownIcon } from 'lucide-react'
import { type FunctionComponent, useCallback, useEffect, useState } from 'react'
import { Button } from './shadcn/ui/button'

const MARGIN = 200 /* px */

/**
 * A component that displays a down arrow at the bottom of the viewport to inform the user that
 * there is more content if they scroll down.
 */
export const ScrollDown: FunctionComponent<{ onClick?: () => void }> = ({ onClick: parentOnClick }) => {
    const [canScrollDown, setCanScrollDown] = useState(false)

    useEffect(() => {
        function handleScroll() {
            const scrollPosition = window.scrollY
            const scrollHeight = window.document.body.scrollHeight
            const clientHeight = window.innerHeight
            setCanScrollDown(scrollPosition + clientHeight < scrollHeight - MARGIN)
        }
        handleScroll()
        window.addEventListener('scroll', handleScroll)
        window.addEventListener('resize', handleScroll)

        const resizeObserver = new ResizeObserver(() => {
            handleScroll()
        })
        resizeObserver.observe(window.document.body)

        return () => {
            window.removeEventListener('scroll', handleScroll)
            window.removeEventListener('resize', handleScroll)
            resizeObserver.disconnect()
        }
    }, [])

    const onClick = useCallback(() => {
        setCanScrollDown(false) // immediately hide to avoid jitter
        window.scrollTo({
            top: window.document.body.scrollHeight,
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

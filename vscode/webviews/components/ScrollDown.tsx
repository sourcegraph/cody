import { ArrowDownIcon } from 'lucide-react'
import type { FC } from 'react'
import { Button } from './shadcn/ui/button'

interface ScrollDownProps {
    onClick?: () => void
}

/**
 * A component that displays a down arrow at the bottom of the viewport to inform the user that
 * there is more content if they scroll down.
 */
export const ScrollDown: FC<ScrollDownProps> = props => {
    return (
        <div className="tw-relative tw-left-1/2 tw--translate-x-1/2 tw-z-50 tw-w-fit tw-h-0 tw--top-8">
            <Button
                variant="outline"
                size="sm"
                onClick={props.onClick}
                className="tw-rounded-full tw-py-3 tw-my-4 tw hover:tw-bg-primary-hover"
            >
                <ArrowDownIcon size={16} /> Skip to end
            </Button>
        </div>
    )
}

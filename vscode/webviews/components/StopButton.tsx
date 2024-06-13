import { StopCircle } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { Button } from './shadcn/ui/button'

export const StopButton: FunctionComponent<{ onClick?: () => void }> = ({ onClick: parentOnClick }) => (
    <div className="tw-sticky tw-bottom-0 tw-w-full tw-text-center tw-py-4">
        <Button
            variant="outline"
            size="lg"
            onClick={parentOnClick}
            className="tw-py-3 hover:tw-bg-secondary"
        >
            <StopCircle size="1.5rem" />
        </Button>
    </div>
)

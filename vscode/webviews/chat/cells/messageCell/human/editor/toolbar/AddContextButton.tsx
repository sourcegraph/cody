import { AtSignIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

export const AddContextButton: FunctionComponent<{
    onClick: () => void
    className?: string
}> = ({ onClick, className }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                variant="ghost"
                size="icon"
                onClick={onClick}
                aria-label="Add context"
                className={className}
            >
                <AtSignIcon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
            </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
            Add files and other context <Kbd macOS="@" linuxAndWindows="@" />
        </TooltipContent>
    </Tooltip>
)

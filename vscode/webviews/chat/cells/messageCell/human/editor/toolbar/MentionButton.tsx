import { AtSignIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { ToolbarButton } from '../../../../../../components/shadcn/ui/toolbar'

export const MentionButton: FunctionComponent<{
    onClick: () => void
}> = ({ onClick }) => {
    return (
        <ToolbarButton
            variant="secondary"
            tooltip="Add files and other context"
            iconStart={AtSignIcon}
            onClick={onClick}
            aria-label="Add context"
            tabIndex={-1} // type '@' to invoke, doesn't need to be tabbable
        />
    )
}

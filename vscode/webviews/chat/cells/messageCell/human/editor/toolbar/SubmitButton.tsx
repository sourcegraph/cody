import { LoaderCircleIcon, PlayIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'
import { Button } from '../../../../../../components/shadcn/ui/button'

export type SubmitButtonDisabled = false | 'emptyEditorValue' | 'isPendingPriorResponse'

export const SubmitButton: FunctionComponent<{
    onClick: (withEnhancedContext: boolean) => void
    isEditorFocused?: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    disabled?: SubmitButtonDisabled
}> = ({ onClick: parentOnClick, isEditorFocused, isPendingResponse, disabled = false }) => {
    return (
        <>
            <Button
                type="submit"
                variant="ghost"
                className=""
                // tooltip="Send"
                onClick={() => parentOnClick(true)}
                aria-label="Send"
                disabled={disabled !== false}
                tabIndex={-1} // press Enter to invoke, doesn't need to be tabbable
            >
                {disabled === 'isPendingPriorResponse' ? <LoaderCircleIcon /> : <PlayIcon />}
            </Button>
        </>
    )
}

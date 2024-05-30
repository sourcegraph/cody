import type { FunctionComponent } from 'react'
import { cn } from '../../../../../../components/shadcn/utils'
import styles from './SubmitButton.module.css'

export type SubmitButtonDisabled = false | 'emptyEditorValue' | 'isPendingPriorResponse'

export const SubmitButton: FunctionComponent<{
    onClick: (withEnhancedContext: boolean) => void
    isEditorFocused?: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    disabled?: SubmitButtonDisabled
}> = ({ onClick: parentOnClick, isEditorFocused, isPendingResponse, disabled = false }) => {
    if (disabled === 'isPendingPriorResponse') {
        return (
            <button
                type="submit"
                disabled
                className="tw-w-[20px] tw-h-[20px] tw-flex tw-items-center tw-justify-center tw-opacity-60"
            >
                <div className="tw-inline-block tw-h-[13px] tw-w-[13px] tw-animate-spin tw-rounded-full tw-border-[1px] tw-border-solid tw-border-current tw-border-e-transparent" />
            </button>
        )
    }

    return (
        <button
            type="submit"
            className={cn('tw-relative tw-w-[20px] tw-h-[20px]', styles.button)}
            onClick={() => parentOnClick(true)}
            aria-label="Send"
            disabled={disabled ? true : undefined}
        >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
            <svg width="20" height="20" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="9.5" />
                <path d="M8.25 6L14.25 10L8.25 14V6Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    )
}

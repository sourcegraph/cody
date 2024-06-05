import type { FunctionComponent } from 'react'
import { cn } from '../../../../../../components/shadcn/utils'
import styles from './SubmitButton.module.css'

export type SubmitButtonDisabled = false | 'emptyEditorValue' | 'isPendingPriorResponse'

export const SubmitButton: FunctionComponent<{
    onClick: () => void
    isEditorFocused?: boolean
    disabled?: SubmitButtonDisabled
}> = ({ onClick, disabled = false }) => {
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
            onClick={onClick}
            aria-label="Send"
            disabled={disabled ? true : undefined}
        >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: */}
            <svg width="8" height="10" viewBox="0 0 8 10">
                <path d="M1.25 1L7.25 5L1.25 9V1Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    )
}

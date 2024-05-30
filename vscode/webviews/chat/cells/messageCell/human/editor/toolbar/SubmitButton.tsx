import type { FunctionComponent } from 'react'
import { cn } from '../../../../../../components/shadcn/utils'

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
            className="tw-relative tw-w-[20px] tw-h-[20px]"
            onClick={() => parentOnClick(true)}
            aria-label="Send"
            disabled={disabled ? true : undefined}
        >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
            <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={cn('tw-absolute tw-left-0 tw-top-0', {
                    'tw-opacity-20': disabled,
                    'tw-text-primary': !disabled,
                })}
            >
                <circle cx="10" cy="10" r="10" />
            </svg>
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: <explanation> */}
            <svg
                width="7"
                height="8"
                viewBox="0 0 7 8"
                className="tw-absolute tw-left-[7.75px] tw-top-[6px]"
                fill="currentColor"
            >
                <path d="M6.13965 3.54579L0.820964 0V0.251915L0.647792 0.136467C0.519935 0.0512288 0.355541 0.0432819 0.220059 0.11579C0.0845769 0.188298 0 0.32949 0 0.483154V7.57473C0 7.7284 0.0845769 7.86959 0.220059 7.9421C0.355541 8.01461 0.519935 8.00666 0.647792 7.92142L5.96648 4.37563C6.08239 4.29835 6.15202 4.16826 6.15202 4.02894C6.15202 3.88963 6.08239 3.75953 5.96648 3.68226L5.95071 3.67175L6.13965 3.54579Z" />
            </svg>
        </button>
    )
}

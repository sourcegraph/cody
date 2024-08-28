import clsx from 'clsx'
import type { FunctionComponent } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'

export type SubmitButtonState = 'submittable' | 'emptyEditorValue' | 'waitingResponseComplete'

export const SubmitButton: FunctionComponent<{
    onClick: () => void
    isEditorFocused?: boolean
    state?: SubmitButtonState
    className?: string
}> = ({ onClick, state = 'submittable', className }) => {
    if (state === 'waitingResponseComplete') {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onClick}
                        type="submit"
                        variant="ghostRoundedIcon"
                        className={clsx(
                            'tw-relative tw-overflow-hidden tw-w-[20px] tw-h-[20px] tw-bg-transparent tw-group',
                            className
                        )}
                        title="Stop"
                    >
                        <div className="tw-absolute tw-top-[0px] tw-left-[0px] tw-h-[18px] tw-w-[18px] tw-animate-spin tw-rounded-full tw-border-[1px] tw-border-solid tw-border-current tw-border-e-transparent high-contrast-dark:tw-border-button-border high-contrast-dark:tw-border-e-transparent" />
                        <div className="tw-absolute tw-top-[5.5px] tw-left-[5.5px] tw-h-[7px] tw-w-[7px] tw-rounded-[0.5px] tw-bg-current tw-opacity-80 group-hover:tw-opacity-100" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    Stop <Kbd macOS="esc" linuxAndWindows="esc" />
                </TooltipContent>
            </Tooltip>
        )
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="primaryRoundedIcon"
                    onClick={onClick}
                    disabled={state === 'emptyEditorValue'}
                    type="submit"
                    className={clsx('tw-relative tw-w-[20px] tw-h-[20px]', className)}
                    title="Send"
                >
                    {/* biome-ignore lint/a11y/noSvgWithoutTitle: */}
                    <svg
                        width="8"
                        height="10"
                        viewBox="0 0 8 10"
                        className="tw-translate-x-[1px]"
                        fill="currentColor"
                    >
                        <path
                            d="M1.25 1L7.25 5L1.25 9V1Z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
                Send <Kbd macOS="return" linuxAndWindows="return" />
            </TooltipContent>
        </Tooltip>
    )
}

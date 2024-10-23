import type { ChatMessage } from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { BadgeCheck, BetweenHorizonalEnd, Pencil, Search } from 'lucide-react'
import type { FC } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { Button } from '../../../../../../components/shadcn/ui/button'
import { Command, CommandItem, CommandList } from '../../../../../../components/shadcn/ui/command'
import { ToolbarPopoverItem } from '../../../../../../components/shadcn/ui/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../../components/shadcn/ui/tooltip'
import { useExperimentalOneBox } from '../../../../../../utils/useExperimentalOneBox'
import { CodyIcon } from '../../../../../components/CodyIcon'

export type SubmitButtonState = 'submittable' | 'emptyEditorValue' | 'waitingResponseComplete'

const IntentOptions: {
    title: string
    icon: React.FC<{ className?: string }>
    intent: ChatMessage['intent']
}[] = [
    {
        title: 'Best for question',
        icon: BadgeCheck,
        intent: undefined,
    },
    {
        title: 'Ask the LLM',
        icon: CodyIcon,
        intent: 'chat',
    },
    {
        title: 'Search Code',
        icon: Search,
        intent: 'search',
    },
    {
        title: 'Edit Code',
        icon: Pencil,
        intent: 'edit',
    },
    {
        title: 'Insert Code',
        icon: BetweenHorizonalEnd,
        intent: 'insert',
    },
]

export const SubmitButton: FC<{
    onClick: (intent?: ChatMessage['intent']) => void
    isEditorFocused?: boolean
    state?: SubmitButtonState
    className?: string
    intent?: ChatMessage['intent']
    onSelectIntent?: (intent: ChatMessage['intent']) => void
}> = ({ onClick, state = 'submittable', className, intent, onSelectIntent }) => {
    const experimentalOneBoxEnabled = useExperimentalOneBox()

    if (state === 'waitingResponseComplete') {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={() => onClick()}
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

    const selectedIntent = IntentOptions.find(option => option.intent === intent)

    return (
        <div className="tw-flex tw-items-center">
            {experimentalOneBoxEnabled && selectedIntent && (
                <selectedIntent.icon className="tw-size-8 tw-mr-2" />
            )}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="primaryRoundedIcon"
                        onClick={() => onClick(intent)}
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
            {experimentalOneBoxEnabled && (
                <ToolbarPopoverItem
                    role="combobox"
                    iconEnd="chevron"
                    className="tw-justify-between tw-inline-flex"
                    aria-label="Insert prompt"
                    popoverContent={close => (
                        <Command>
                            <CommandList>
                                {IntentOptions.map(option => (
                                    <CommandItem
                                        key={option.intent ?? option.title}
                                        onSelect={() => {
                                            onSelectIntent?.(option.intent)
                                            close()
                                        }}
                                        className="tw-flex tw-text-left tw-justify-between"
                                    >
                                        <div className="tw-flex tw-items-center tw-gap-2">
                                            <option.icon className="tw-size-8" />
                                            {option.title}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandList>
                        </Command>
                    )}
                    popoverContentProps={{
                        className: 'tw-w-[225px] !tw-p-0',
                        onCloseAutoFocus: event => {
                            // Prevent the popover trigger from stealing focus after the user selects an
                            // item. We want the focus to return to the editor.
                            event.preventDefault()
                        },
                    }}
                />
            )}
        </div>
    )
}

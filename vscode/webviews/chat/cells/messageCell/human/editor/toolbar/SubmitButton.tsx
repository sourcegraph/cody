import {
    Popover,
    PopoverContent,
    type PopoverContentProps,
    type PopoverProps,
    PopoverTrigger,
} from '@radix-ui/react-popover'
import type { ChatMessage } from '@sourcegraph/cody-shared'
import { CodyIDE } from '@sourcegraph/cody-shared'
import clsx from 'clsx'

import {
    BetweenHorizonalEnd,
    ChevronDown,
    InfoIcon,
    MessageSquare,
    Pencil,
    Play,
    Search,
    Sparkles,
    Square,
} from 'lucide-react'
import type { FC, FunctionComponent, KeyboardEventHandler, PropsWithChildren } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { useIntentDetectionConfig } from '../../../../../../components/omnibox/intentDetection'
import { Badge } from '../../../../../../components/shadcn/ui/badge'
import {
    Command,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '../../../../../../components/shadcn/ui/command'
import { Switch } from '../../../../../../components/shadcn/ui/switch'
import { useConfig } from '../../../../../../utils/useConfig'
import { useOmniBox } from '../../../../../../utils/useOmniBox'

export type SubmitButtonState = 'submittable' | 'emptyEditorValue' | 'waitingResponseComplete'

interface IntentOption {
    title: string | React.ReactElement
    icon: React.FC<{ className?: string }>
    intent: ChatMessage['intent']
    shortcut?: React.ReactNode
    hidden?: boolean
    disabled?: boolean
}

function getIntentOptions({
    ide,
    isDotComUser,
    detectedIntent,
    intentDetectionDisabled,
    intentDetectionToggleOn,
}: {
    ide: CodyIDE
    isDotComUser: boolean
    detectedIntent: ChatMessage['intent']
    intentDetectionDisabled: boolean
    intentDetectionToggleOn: boolean
}): IntentOption[] {
    const intentDetectionAvailable = !isDotComUser && !intentDetectionDisabled && intentDetectionToggleOn

    const standardOneBoxIntents: IntentOption[] = [
        {
            title: (
                <div className="tw-flex tw-flex-col tw-self-start">
                    <p>Run detected intent</p>
                    <p className="tw-text-sm tw-text-muted-foreground">
                        {isDotComUser
                            ? 'Detects intent and runs appropriately'
                            : `Currently: ${
                                  detectedIntent ? (detectedIntent === 'search' ? 'Search' : 'Chat') : ''
                              }`}
                    </p>
                </div>
            ),
            icon: Sparkles,
            intent: undefined,
            hidden: !intentDetectionAvailable,
            disabled: isDotComUser,
            shortcut: isDotComUser ? (
                <Badge>
                    Enterprise <InfoIcon className="tw-size-4 tw-ml-1" />
                </Badge>
            ) : (
                <Kbd macOS="return" linuxAndWindows="return" />
            ),
        },
        {
            title: 'Run as chat',
            icon: MessageSquare,
            intent: 'chat',
            shortcut: (
                <>
                    {intentDetectionAvailable && <Kbd macOS="cmd" linuxAndWindows="ctrl" />}
                    <Kbd macOS="return" linuxAndWindows="return" />
                </>
            ),
        },
        {
            title: (
                <span className="tw-inline-flex tw-items-center tw-gap-4">
                    <span>Run as search</span>
                    <Badge>Beta</Badge>
                </span>
            ),
            icon: Search,
            intent: 'search',
            disabled: isDotComUser,
            shortcut: isDotComUser ? (
                <Badge>
                    Enterprise <InfoIcon className="tw-size-4 tw-ml-1" />
                </Badge>
            ) : (
                <>
                    <Kbd macOS="cmd" linuxAndWindows="ctrl" />
                    <Kbd macOS="opt" linuxAndWindows="alt" />
                    <Kbd macOS="return" linuxAndWindows="return" />
                </>
            ),
        },
    ]

    if (ide === CodyIDE.Web) {
        return standardOneBoxIntents
    }

    return [
        ...standardOneBoxIntents,
        {
            title: 'Edit Code',
            icon: Pencil,
            intent: 'edit',
            hidden: true,
        },
        {
            title: 'Insert Code',
            icon: BetweenHorizonalEnd,
            intent: 'insert',
            hidden: true,
        },
    ]
}

export const SubmitButton: FC<{
    onClick: (intent?: ChatMessage['intent']) => void
    isEditorFocused?: boolean
    state?: SubmitButtonState
    detectedIntent?: ChatMessage['intent']
}> = ({ onClick, state = 'submittable', detectedIntent }) => {
    const experimentalOneBoxEnabled = useOmniBox()
    const {
        clientCapabilities: { agentIDE },
        isDotComUser,
    } = useConfig()

    const { intentDetectionDisabled, intentDetectionToggleOn, updateIntentDetectionToggle } =
        useIntentDetectionConfig()

    const intentOptions = useMemo(
        () =>
            getIntentOptions({
                ide: agentIDE,
                detectedIntent,
                intentDetectionDisabled,
                intentDetectionToggleOn,
                isDotComUser,
            }),
        [agentIDE, detectedIntent, intentDetectionDisabled, intentDetectionToggleOn, isDotComUser]
    )

    const inProgress = state === 'waitingResponseComplete'
    const disabled = state === 'emptyEditorValue'

    const detectedIntentOption = intentOptions.find(option => option.intent === detectedIntent)

    const Icon = detectedIntentOption?.intent ? detectedIntentOption.icon : Play
    const iconClassName = `tw-size-6 ${
        detectedIntentOption?.intent === 'search' ? '' : 'tw-fill-current'
    }`

    const toggleIntentDetection = useCallback(() => {
        updateIntentDetectionToggle(!intentDetectionToggleOn)
    }, [intentDetectionToggleOn, updateIntentDetectionToggle])

    if (!experimentalOneBoxEnabled || inProgress) {
        return (
            <div className="tw-flex">
                <button
                    type="submit"
                    onClick={() => onClick()}
                    disabled={disabled}
                    className={clsx(
                        'tw-px-6 tw-py-1',
                        'tw-rounded-full',
                        'tw-w-full tw-relative tw-border tw-border-transparent tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',
                        'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground',
                        inProgress && processingAnimationClasses
                    )}
                    title={inProgress ? 'Stop' : 'Send'}
                >
                    {inProgress ? (
                        <Square className="tw-size-6 tw-fill-current" />
                    ) : (
                        <Play className="tw-size-6 tw-fill-current" />
                    )}
                </button>{' '}
            </div>
        )
    }

    return (
        <div className="tw-flex tw-items-center">
            <button
                type="submit"
                onClick={() => onClick()}
                disabled={disabled}
                className={clsx(
                    'tw-px-3 tw-py-1 md:twpx-4 md:tw-py-2',
                    'tw-rounded-tl-full tw-rounded-bl-full',
                    'tw-w-full tw-relative tw-border tw-border-button-border tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',

                    'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground'
                )}
                title="Send"
            >
                <Icon className={iconClassName} />
            </button>
            <PopoverItem
                aria-label="Insert prompt"
                popoverContent={close => (
                    <Command>
                        <CommandList className="tw-p-2">
                            {intentOptions.map(option =>
                                // biome-ignore lint/correctness/useJsxKeyInIterable: We don't need a key for null
                                option.hidden || option.disabled ? null : (
                                    <CommandItem
                                        key={option.intent || 'auto'}
                                        onSelect={() => {
                                            onClick(option.intent)
                                            close()
                                        }}
                                        className="tw-flex tw-text-left tw-justify-between tw-rounded-sm tw-cursor-pointer tw-px-4"
                                    >
                                        <div className="tw-flex tw-gap-4">
                                            <option.icon className="tw-size-8 tw-mt-1" />
                                            {option.title}
                                        </div>
                                        {option.shortcut && (
                                            <div className="tw-flex tw-gap-2">{option.shortcut}</div>
                                        )}
                                    </CommandItem>
                                )
                            )}
                            <CommandSeparator />
                            {intentOptions.map(option =>
                                // biome-ignore lint/correctness/useJsxKeyInIterable: We don't need a key for null
                                option.hidden || !option.disabled ? null : (
                                    <CommandItem
                                        key={option.intent || 'auto'}
                                        onSelect={() => {
                                            onClick(option.intent)
                                            close()
                                        }}
                                        disabled={true}
                                        className="tw-flex tw-text-left tw-justify-between tw-rounded-sm tw-cursor-pointer"
                                    >
                                        <div className="tw-flex tw-gap-2">
                                            <option.icon className="tw-size-8 tw-mt-1" />
                                            {option.title}
                                        </div>
                                        {option.shortcut && (
                                            <div className="tw-flex tw-gap-2">{option.shortcut}</div>
                                        )}
                                    </CommandItem>
                                )
                            )}
                            {!isDotComUser && !(intentDetectionDisabled ?? false) && (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={toggleIntentDetection}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.stopPropagation()
                                            toggleIntentDetection()
                                        }
                                    }}
                                    className="tw-flex tw-p-4 tw-gap-6 tw-items-center tw-cursor-pointer hover:tw-bg-button-secondary-background"
                                >
                                    <Switch checked={intentDetectionToggleOn} />
                                    <div className="tw-flex tw-flex-col">
                                        <div>
                                            <span className="tw-font-medium tw-mr-4">
                                                Intent Detection
                                            </span>
                                            <Badge variant="secondary">Beta</Badge>
                                        </div>
                                        <p className="tw-text-sm tw-text-muted-foreground">
                                            Automatic selection between chat and search
                                        </p>
                                    </div>
                                </div>
                            )}
                        </CommandList>
                    </Command>
                )}
                popoverContentProps={{
                    className: 'tw-w-[350px] !tw-p-0 tw-z-10 tw-my-2',
                    onCloseAutoFocus: event => {
                        // Prevent the popover trigger from stealing focus after the user selects an
                        // item. We want the focus to return to the editor.
                        event.preventDefault()
                    },
                }}
            >
                <button
                    type="button"
                    disabled={disabled}
                    className={clsx(
                        'tw-pl-1 tw-pr-2 tw-py-1 md:pl-2 md:tw-pr-3 md:tw-py-2',
                        'tw-rounded-tr-full tw-rounded-br-full tw-border-l-0',
                        'tw-w-full tw-relative tw-border tw-border-button-border tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',
                        'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground'
                    )}
                    title="Send"
                >
                    <ChevronDown className="tw-size-6" />
                </button>
            </PopoverItem>
        </div>
    )
}
export const PopoverItem: FunctionComponent<
    PropsWithChildren<{
        popoverContent: (close: () => void) => React.ReactNode

        defaultOpen?: boolean

        onCloseByEscape?: () => void

        popoverRootProps?: Pick<PopoverProps, 'onOpenChange'>
        popoverContentProps?: Omit<PopoverContentProps, 'align'>
    }>
> = ({
    popoverContent,
    defaultOpen,
    onCloseByEscape,
    popoverRootProps,
    popoverContentProps,
    children,
    ...props
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const anchorRef = useRef<HTMLButtonElement>(null)

    const popoverContentRef = useRef<HTMLDivElement>(null)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            popoverRootProps?.onOpenChange?.(open)

            setIsOpen(open)

            // Ensure we blur the popover content if it was focused, because React's `onBlur`
            // doesn't get called when the focused event is unmounted (see
            // https://github.com/facebook/react/issues/12363#issuecomment-1988608527). This causes
            // a bug in our HumanMessageEditor where if you interact with any toolbar items that
            // steal focus for their menu, then the HumanMessageRow stays with partial focus
            // styling. See the "chat toolbar and row UI" e2e test.
            if (
                document.activeElement instanceof HTMLElement &&
                popoverContentRef.current?.contains(document.activeElement)
            ) {
                anchorRef.current?.focus()
            }
        },
        [popoverRootProps?.onOpenChange]
    )

    const close = useCallback(() => {
        onOpenChange(false)
    }, [onOpenChange])

    // After pressing Escape, return focus to the given component.
    const onKeyDownInPopoverContent = useCallback<KeyboardEventHandler<HTMLDivElement>>(
        event => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
            popoverContentProps?.onKeyDown?.(event)
        },
        [onCloseByEscape, popoverContentProps?.onKeyDown]
    )

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
            <PopoverTrigger asChild={true}>{children}</PopoverTrigger>
            <PopoverContent
                align="end"
                onKeyDown={onKeyDownInPopoverContent}
                ref={popoverContentRef}
                {...popoverContentProps}
                className={clsx(
                    'tw-w-[350px] !tw-p-0 tw-z-10 tw-my-2 tw-shadow-lg tw-border tw-border-button-border tw-rounded-md',
                    popoverContentProps?.className
                )}
            >
                {popoverContent(close)}
            </PopoverContent>
        </Popover>
    )
}

const processingAnimationClasses = clsx(
    'tw-animate-fast-pulse',
    'tw-relative',
    'tw-border-transparent',
    'tw-bg-button-background-hover',
    'before:tw-absolute before:tw-inset-0',
    'before:tw-rounded-full',
    'before:tw-border',
    'before:tw-border-transparent',
    'before:tw-bg-[length:300%_100%]',
    'before:tw-bg-gradient-to-r',
    'before:tw-from-white/10 before:tw-via-transparent before:tw-to-white/10',
    'before:tw-animate-border-travel-fast'
)

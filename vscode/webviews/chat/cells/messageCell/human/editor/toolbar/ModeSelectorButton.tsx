import type { ChatMessage } from '@sourcegraph/cody-shared'
import { isMacOS } from '@sourcegraph/cody-shared'
import { BetweenHorizonalEnd, MessageSquare, Pencil, Search, Sparkle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '../../../../../../components/shadcn/ui/badge'
import { Command, CommandItem, CommandList } from '../../../../../../components/shadcn/ui/command'
import { ToolbarPopoverItem } from '../../../../../../components/shadcn/ui/toolbar'
import { cn } from '../../../../../../components/shadcn/utils'
import { useConfig } from '../../../../../../utils/useConfig'

const isMac = isMacOS()

export enum IntentEnum {
    Agentic = 'Agent',
    Chat = 'Chat',
    Search = 'Search',
    Edit = 'Edit',
    Insert = 'Insert',
}

// Mapping between ChatMessage intent and IntentEnum for faster lookups
export const INTENT_MAPPING: Record<string, IntentEnum> = {
    agentic: IntentEnum.Agentic,
    chat: IntentEnum.Chat,
    search: IntentEnum.Search,
    edit: IntentEnum.Edit,
    insert: IntentEnum.Insert,
}

interface IntentOption {
    title: string
    icon: React.FC<{ className?: string }>
    intent: NonNullable<ChatMessage['intent']>
    badge?: string
    hidden?: boolean
    disabled?: boolean
    agent?: string
    value: IntentEnum
}

export const ModeSelectorField: React.FunctionComponent<{
    omniBoxEnabled: boolean
    isDotComUser: boolean
    isCodyProUser: boolean
    _intent: ChatMessage['intent']
    className?: string
    manuallySelectIntent: (intent?: ChatMessage['intent']) => void
}> = ({ isDotComUser, className, _intent = 'chat', omniBoxEnabled, manuallySelectIntent }) => {
    const {
        clientCapabilities: { edit },
        config,
    } = useConfig()

    // Generate intent options based on current configuration
    const intentOptions = useMemo(() => {
        const isEditEnabled = edit !== 'none'
        const agenticChatEnabled = !!config?.experimentalAgenticChatEnabled

        return [
            {
                title: 'Chat',
                icon: MessageSquare,
                intent: 'chat',
                value: IntentEnum.Chat,
            },
            {
                title: 'Search',
                badge: isDotComUser ? 'Enterprise' : 'Beta',
                icon: Search,
                intent: 'search',
                hidden: !omniBoxEnabled,
                disabled: isDotComUser,
                value: IntentEnum.Search,
            },
            {
                title: 'Agent',
                badge: agenticChatEnabled ? 'Experimental' : 'Pro',
                icon: Sparkle,
                intent: 'agentic',
                hidden: !agenticChatEnabled,
                disabled: !agenticChatEnabled,
                value: IntentEnum.Agentic,
            },
            {
                title: 'Edit Code',
                badge: 'Experimental',
                icon: Pencil,
                intent: 'edit',
                hidden: true,
                disabled: !isEditEnabled,
                value: IntentEnum.Edit,
            },
            {
                title: 'Insert Code',
                badge: 'Experimental',
                icon: BetweenHorizonalEnd,
                intent: 'insert',
                hidden: true,
                disabled: !isEditEnabled,
                value: IntentEnum.Insert,
            },
        ].filter(option => !option.hidden) as IntentOption[]
    }, [edit, config?.experimentalAgenticChatEnabled, isDotComUser, omniBoxEnabled])

    // Get available (non-disabled) options
    const availableOptions = useMemo(
        () => intentOptions.filter(option => !option.disabled),
        [intentOptions]
    )

    // Initialize with the provided intent or fallback to chat
    const [currentSelectedIntent, setCurrentSelectedIntent] = useState(() => {
        const mappedIntent = INTENT_MAPPING[_intent || 'chat']
        // Check if the intent is available and not disabled
        const isValidIntent = intentOptions.some(
            option => option.value === mappedIntent && !option.disabled
        )
        return isValidIntent ? mappedIntent : IntentEnum.Chat
    })

    // Handle intent selection
    const handleSelectIntent = useCallback(
        (intent: ChatMessage['intent'], close?: () => void) => {
            manuallySelectIntent(intent)
            setCurrentSelectedIntent(INTENT_MAPPING[intent || 'chat'])
            close?.()
        },
        [manuallySelectIntent]
    )

    // Handle keyboard shortcut
    useEffect(() => {
        // Only enable shortcut if there are multiple available options
        if (availableOptions.length <= 1) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if ((isMac ? event.metaKey : event.ctrlKey) && event.key === '.') {
                event.preventDefault()

                // Find current index in available options
                const currentIndex = availableOptions.findIndex(
                    option => option.value === currentSelectedIntent
                )

                // Select next option in the list
                const nextIndex = (currentIndex + 1) % availableOptions.length
                handleSelectIntent(availableOptions[nextIndex].intent)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [availableOptions, currentSelectedIntent, handleSelectIntent])

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            tooltip={`Switch mode (${isMac ? '⌘.' : 'Ctrl.'})`}
            aria-label="switch-mode"
            popoverContent={close => (
                <div className="tw-flex tw-flex-col tw-max-h-[500px] tw-overflow-auto">
                    <Command>
                        <CommandList className="tw-p-2">
                            {intentOptions.map(option => (
                                <CommandItem
                                    key={option.intent}
                                    onSelect={() => handleSelectIntent(option.intent, close)}
                                    disabled={option.disabled}
                                    className="tw-flex tw-text-left tw-justify-between tw-rounded-sm tw-cursor-pointer tw-px-4"
                                >
                                    <div className="tw-flex tw-gap-4">
                                        <option.icon className="tw-size-8 tw-mt-1" />
                                        {option.title}
                                    </div>
                                    {option.badge && <Badge>{option.badge}</Badge>}
                                </CommandItem>
                            ))}
                        </CommandList>
                    </Command>
                </div>
            )}
            popoverContentProps={{
                className: 'tw-min-w-[200px] tw-w-[30vw] tw-max-w-[300px] !tw-p-0',
                onCloseAutoFocus: event => {
                    event.preventDefault()
                },
            }}
        >
            {currentSelectedIntent}
        </ToolbarPopoverItem>
    )
}

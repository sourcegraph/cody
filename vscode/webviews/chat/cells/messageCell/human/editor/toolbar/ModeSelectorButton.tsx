import type { ChatMessage } from '@sourcegraph/cody-shared'
import { isMacOS } from '@sourcegraph/cody-shared'
import { BetweenHorizonalEnd, MessageSquare, Pencil, Search, Sparkle } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { Badge } from '../../../../../../components/shadcn/ui/badge'
import { Command, CommandItem, CommandList } from '../../../../../../components/shadcn/ui/command'
import { ToolbarPopoverItem } from '../../../../../../components/shadcn/ui/toolbar'
import { cn } from '../../../../../../components/shadcn/utils'
import { useConfig } from '../../../../../../utils/useConfig'

const isMac = isMacOS()

export enum IntentEnum {
    Agentic = 'Agentic',
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
}

const chatIntent: IntentOption = {
    title: 'Chat',
    icon: MessageSquare,
    intent: 'chat',
}

function getIntentOptions({
    isEditEnabled,
    isDotComUser,
    omniBoxEnabled,
    agenticChatEnabled,
}: {
    isEditEnabled: boolean
    isDotComUser: boolean
    omniBoxEnabled: boolean
    agenticChatEnabled: boolean
}): IntentOption[] {
    return [
        chatIntent,
        {
            title: 'Search',
            badge: isDotComUser ? 'Enterprise' : 'Beta',
            icon: Search,
            intent: 'search',
            hidden: !omniBoxEnabled,
            disabled: isDotComUser,
        },
        {
            title: 'Agentic',
            badge: agenticChatEnabled ? 'Experimental' : 'Pro',
            icon: Sparkle,
            intent: 'agentic',
            hidden: !agenticChatEnabled,
            disabled: !agenticChatEnabled,
        },
        {
            title: 'Edit Code',
            badge: 'Experimental',
            icon: Pencil,
            intent: 'edit',
            hidden: true,
            disabled: !isEditEnabled,
        },
        {
            title: 'Insert Code',
            badge: 'Experimental',
            icon: BetweenHorizonalEnd,
            intent: 'insert',
            hidden: true,
            disabled: !isEditEnabled,
        },
    ]
}

export const ModeSelectorField: React.FunctionComponent<{
    omniBoxEnabled: boolean
    isDotComUser: boolean
    isCodyProUser: boolean
    intent: ChatMessage['intent']
    className?: string
    manuallySelectIntent: (intent?: ChatMessage['intent']) => void
}> = ({ isDotComUser, className, intent, omniBoxEnabled, manuallySelectIntent }) => {
    const {
        clientCapabilities: { edit },
        config,
    } = useConfig()

    const intentOptions = useMemo(
        () =>
            getIntentOptions({
                isEditEnabled: edit !== 'none',
                isDotComUser,
                omniBoxEnabled,
                agenticChatEnabled: !!config?.experimentalAgenticChatEnabled,
            }).filter(option => !option.hidden),
        [edit, isDotComUser, omniBoxEnabled, config?.experimentalAgenticChatEnabled]
    )

    // Memoize the handler to avoid recreating on each render
    const handleItemClick = useCallback(
        (close: () => void) => (item: ChatMessage['intent']) => {
            manuallySelectIntent(item)
            close()
        },
        [manuallySelectIntent]
    )

    // Handle keyboard shortcut to cycle through intent options
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            // Check for ⌘. (Command+Period on macOS, Ctrl+Period on other platforms)
            if ((isMac ? event.metaKey : event.ctrlKey) && event.key === '.') {
                event.preventDefault()
                // Find the current index and select the next intent option
                const currentIntent = intent || 'chat'
                const currentIndex = intentOptions.findIndex(option => option.intent === currentIntent)

                // Find the next enabled option
                let nextIndex = (currentIndex + 1) % intentOptions.length
                let attempts = 0

                // Loop until we find an enabled option or we've checked all options
                while (intentOptions[nextIndex].disabled && attempts < intentOptions.length) {
                    nextIndex = (nextIndex + 1) % intentOptions.length
                    attempts++
                }

                // Only change the intent if we found an enabled option
                if (!intentOptions[nextIndex].disabled) {
                    manuallySelectIntent(intentOptions[nextIndex].intent)
                }
            }
        },
        [intent, intentOptions, manuallySelectIntent]
    )

    // Add event listener for keyboard shortcut only if user has appropriate permissions
    useEffect(() => {
        // Only add the keyboard shortcut if:
        // 1. User is not a dotcom user (has enterprise features) OR
        // 2. OmniBox is enabled AND there are multiple enabled intent options available
        const hasMultipleEnabledOptions = intentOptions.filter(option => !option.disabled).length > 1
        const shouldEnableShortcut = (!isDotComUser || omniBoxEnabled) && hasMultipleEnabledOptions

        if (shouldEnableShortcut) {
            document.addEventListener('keydown', handleKeyDown)
            return () => {
                document.removeEventListener('keydown', handleKeyDown)
            }
        }
        // Empty cleanup function when event listener is not added
        return () => {}
    }, [handleKeyDown, isDotComUser, omniBoxEnabled, intentOptions])

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            tooltip={`Switch mode (${isMac ? '⌘.' : 'Ctrl.'})`}
            aria-label="switch-mode"
            popoverContent={close => (
                <div className="tw-flex tw-flex-col tw-max-h-[500px] tw-overflow-auto">
                    <ModeList onClick={handleItemClick(close)} intentOptions={intentOptions} />
                </div>
            )}
            popoverContentProps={{
                className: 'tw-min-w-[200px] tw-w-[30vw] tw-max-w-[300px] !tw-p-0',
                onCloseAutoFocus: event => {
                    event.preventDefault()
                },
            }}
        >
            {INTENT_MAPPING[intent || 'chat'] || IntentEnum.Chat}
        </ToolbarPopoverItem>
    )
}

export const ModeList: FC<{
    onClick: (intent?: ChatMessage['intent']) => void
    intentOptions: IntentOption[]
}> = ({ onClick, intentOptions }) => (
    <Command>
        <CommandList className="tw-p-2">
            {intentOptions.map(option => (
                <CommandItem
                    key={option.intent || 'auto'}
                    onSelect={() => onClick(option.intent)}
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
)

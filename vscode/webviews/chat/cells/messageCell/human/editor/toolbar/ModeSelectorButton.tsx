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
            hidden: !isDotComUser && !agenticChatEnabled,
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
}> = ({ isDotComUser, isCodyProUser, className, intent, omniBoxEnabled, manuallySelectIntent }) => {
    const {
        clientCapabilities: { edit },
        config: { experimentalAgenticChatEnabled },
    } = useConfig()

    const intentOptions = useMemo(
        () =>
            getIntentOptions({
                isEditEnabled: edit !== 'none',
                isDotComUser,
                omniBoxEnabled,
                agenticChatEnabled: isCodyProUser || experimentalAgenticChatEnabled,
            }).filter(option => !option.hidden),
        [edit, isDotComUser, isCodyProUser, omniBoxEnabled, experimentalAgenticChatEnabled]
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
                const nextIndex = (currentIndex + 1) % intentOptions.length
                manuallySelectIntent(intentOptions[nextIndex].intent)
            }
        },
        [intent, intentOptions, manuallySelectIntent]
    )

    // Add event listener for keyboard shortcut
    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [handleKeyDown])

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

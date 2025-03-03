import type { ChatMessage } from '@sourcegraph/cody-shared'
import { CodyIDE, isMacOS } from '@sourcegraph/cody-shared'
import { BetweenHorizonalEnd, Brain, InfoIcon, MessageSquare, Pencil, Search } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { Badge } from '../../../../../../components/shadcn/ui/badge'
import { Command, CommandItem, CommandList } from '../../../../../../components/shadcn/ui/command'
import { ToolbarPopoverItem } from '../../../../../../components/shadcn/ui/toolbar'
import { cn } from '../../../../../../components/shadcn/utils'
import { useConfig } from '../../../../../../utils/useConfig'

const isMac = isMacOS()

export enum IntentEnum {
    Chat = 'Chat',
    Search = 'Search',
    Edit = 'Edit',
    Insert = 'Insert',
}

// Mapping between ChatMessage intent and IntentEnum for faster lookups
export const INTENT_MAPPING: Record<string, IntentEnum> = {
    chat: IntentEnum.Chat,
    search: IntentEnum.Search,
    edit: IntentEnum.Edit,
    insert: IntentEnum.Insert,
}

interface IntentOption {
    title: string | React.ReactElement
    icon: React.FC<{ className?: string }>
    intent: NonNullable<ChatMessage['intent']>
    shortcut?: React.ReactNode
    hidden?: boolean
    disabled?: boolean
    agent?: string
}

const chatIntent: IntentOption = {
    title: 'Chat',
    icon: MessageSquare,
    intent: 'chat',
    shortcut: <Kbd macOS="return" linuxAndWindows="return" />,
}

// Memoize the enterprise badge and keyboard shortcuts to avoid recreating React elements
const ENTERPRISE_BADGE = (
    <Badge>
        Enterprise <InfoIcon className="tw-size-4 tw-ml-1" />
    </Badge>
)

const SEARCH_SHORTCUT = (
    <>
        <Kbd macOS="cmd" linuxAndWindows="ctrl" />
        <Kbd macOS="opt" linuxAndWindows="alt" />
        <Kbd macOS="return" linuxAndWindows="return" />
    </>
)

// Optimization: memoize search title to avoid recreation
const BADGE_TITLE = (title: string, status = 'Beta') => (
    <span className="tw-inline-flex tw-items-center tw-gap-4">
        <span>{title}</span>
        <Badge>{status}</Badge>
    </span>
)

function getIntentOptions({
    isCodyWeb,
    isDotComUser,
    omniBoxEnabled,
}: {
    isCodyWeb: boolean
    isDotComUser: boolean
    omniBoxEnabled: boolean
}): IntentOption[] {
    return [
        chatIntent,
        {
            title: BADGE_TITLE('Search'),
            icon: Search,
            intent: 'search',
            hidden: !omniBoxEnabled,
            disabled: isDotComUser,
            shortcut: isDotComUser ? ENTERPRISE_BADGE : SEARCH_SHORTCUT,
        },
        // NOTE (bee): Agentic mode is not yet implemented
        {
            title: BADGE_TITLE('Agentic', 'Experimental'),
            icon: Brain,
            intent: 'chat',
            // TODO: Implement agentic mode
            hidden: true,
            agent: 'deep-cody',
        },
        {
            title: BADGE_TITLE('Edit Code', 'Experimental'),
            icon: Pencil,
            intent: 'edit',
            hidden: !omniBoxEnabled,
            disabled: isCodyWeb,
        },
        {
            title: BADGE_TITLE('Insert Code', 'Experimental'),
            icon: BetweenHorizonalEnd,
            intent: 'insert',
            hidden: true,
            disabled: isCodyWeb,
        },
    ]
}

export const ModeSelectorField: React.FunctionComponent<{
    omniBoxEnabled: boolean
    intent: ChatMessage['intent']
    className?: string
    manuallySelectIntent: (intent?: ChatMessage['intent']) => void
}> = ({ className, intent, omniBoxEnabled, manuallySelectIntent }) => {
    const {
        clientCapabilities: { agentIDE },
        isDotComUser,
    } = useConfig()

    const intentOptions = useMemo(
        () =>
            getIntentOptions({
                isCodyWeb: agentIDE === CodyIDE.Web,
                isDotComUser,
                omniBoxEnabled,
            }).filter(option => !option.hidden),
        [agentIDE, isDotComUser, omniBoxEnabled]
    )

    const currentIntent = INTENT_MAPPING[intent || 'chat'] || IntentEnum.Chat

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
            if ((event.metaKey || event.ctrlKey) && event.key === '.') {
                event.preventDefault()
                // Find the current index and select the next intent option
                const currentIndex = intentOptions.findIndex(option => option.intent === intent)
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
            tooltip={`Switch mode (${isMac ? '⌘ .' : 'Ctrl .'})`}
            aria-label="switch-mode"
            popoverContent={close => (
                <div className="tw-flex tw-flex-col tw-max-h-[500px] tw-overflow-auto">
                    <ModeList onClick={handleItemClick(close)} intentOptions={intentOptions} />
                </div>
            )}
            popoverContentProps={{
                className: 'tw-min-w-[200px] tw-w-[75vw] tw-max-w-[300px] !tw-p-0',
                onCloseAutoFocus: event => {
                    event.preventDefault()
                },
            }}
        >
            {currentIntent}
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
                    {option.shortcut && <div className="tw-flex tw-gap-2">{option.shortcut}</div>}
                </CommandItem>
            ))}
        </CommandList>
    </Command>
)

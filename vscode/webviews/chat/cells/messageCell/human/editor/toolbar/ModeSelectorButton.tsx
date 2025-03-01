import type { ChatMessage } from '@sourcegraph/cody-shared'
import { CodyIDE } from '@sourcegraph/cody-shared'
import { BetweenHorizonalEnd, InfoIcon, MessageSquare, Pencil, Search } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { Kbd } from '../../../../../../components/Kbd'
import { Badge } from '../../../../../../components/shadcn/ui/badge'
import { Command, CommandItem, CommandList } from '../../../../../../components/shadcn/ui/command'
import { ToolbarPopoverItem } from '../../../../../../components/shadcn/ui/toolbar'
import { cn } from '../../../../../../components/shadcn/utils'
import { useConfig } from '../../../../../../utils/useConfig'

enum IntentEnum {
    Chat = 'Chat',
    Search = 'Search',
    Edit = 'Edit',
    Insert = 'Insert',
}

// Mapping between ChatMessage intent and IntentEnum for faster lookups
const INTENT_MAPPING: Record<string, IntentEnum> = {
    chat: IntentEnum.Chat,
    search: IntentEnum.Search,
    edit: IntentEnum.Edit,
    insert: IntentEnum.Insert,
}

interface IntentOption {
    title: string | React.ReactElement
    icon: React.FC<{ className?: string }>
    intent: ChatMessage['intent']
    shortcut?: React.ReactNode
    hidden?: boolean
    disabled?: boolean
}

const defaultIntent: IntentOption = {
    title: 'Run as chat',
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
const SEARCH_TITLE = (
    <span className="tw-inline-flex tw-items-center tw-gap-4">
        <span>Run as search</span>
        <Badge>Beta</Badge>
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
        defaultIntent,
        {
            title: SEARCH_TITLE,
            icon: Search,
            intent: 'search',
            hidden: !omniBoxEnabled,
            disabled: isDotComUser,
            shortcut: isDotComUser ? ENTERPRISE_BADGE : SEARCH_SHORTCUT,
        },
        {
            title: 'Edit Code',
            icon: Pencil,
            intent: 'edit',
            hidden: true,
            disabled: isCodyWeb,
        },
        {
            title: 'Insert Code',
            icon: BetweenHorizonalEnd,
            intent: 'insert',
            hidden: true,
            disabled: isCodyWeb,
        },
    ]
}

export const ModeSelectorField: React.FunctionComponent<{
    omniBoxEnabled: boolean
    onClick: (intent?: ChatMessage['intent']) => void
    detectedIntent?: ChatMessage['intent']
    className?: string
    manuallySelectIntent: (intent?: ChatMessage['intent']) => void
}> = ({ className, omniBoxEnabled, onClick, manuallySelectIntent }) => {
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

    const [selectedIntent, setSelectedIntent] = useState<IntentEnum>(IntentEnum.Chat)

    // Optimized: replaced nested ternaries with direct mapping lookup
    const onSelectedIntentChange = useCallback(
        (intent: ChatMessage['intent']) => {
            // Get the enum value from mapping or default to Chat
            const displayedIntent = INTENT_MAPPING[intent || 'chat'] || IntentEnum.Chat
            setSelectedIntent(displayedIntent)
            manuallySelectIntent(intent)
            onClick(intent)
        },
        [manuallySelectIntent, onClick]
    )

    // Memoize the handler to avoid recreating on each render
    const handleItemClick = useCallback(
        (close: () => void) => (item: ChatMessage['intent']) => {
            onSelectedIntentChange(item)
            close()
        },
        [onSelectedIntentChange]
    )

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            tooltip="Select a mode"
            aria-label="Select mode"
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
            {selectedIntent.charAt(0).toUpperCase() + selectedIntent.slice(1)}
        </ToolbarPopoverItem>
    )
}

export const ModeList: FC<{
    onClick: (intent?: ChatMessage['intent']) => void
    intentOptions: IntentOption[]
}> = ({ onClick, intentOptions }) => {
    // Create a memoized handler for each item to prevent unnecessary recreations
    const createItemHandler = useCallback(
        (intent: ChatMessage['intent']) => () => {
            onClick(intent)
        },
        [onClick]
    )

    return (
        <Command>
            <CommandList className="tw-p-2">
                {intentOptions.map(option => (
                    <CommandItem
                        key={option.intent || 'auto'}
                        onSelect={createItemHandler(option.intent)}
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
}

import * as Tabs from '@radix-ui/react-tabs'
import clsx from 'clsx'
import {
    CircleUserIcon,
    ColumnsIcon,
    DownloadIcon,
    HistoryIcon,
    type LucideProps,
    MessageSquarePlusIcon,
    MessagesSquareIcon,
    SettingsIcon,
    Trash2Icon,
    ZapIcon,
} from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'

import { CodyIDE } from '@sourcegraph/cody-shared'
import { forwardRef, useCallback, useMemo } from 'react'
import { Kbd } from '../components/Kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import styles from './TabsBar.module.css'

interface TabsBarProps {
    IDE: CodyIDE
    currentView: View
    setView: (view: View) => void
    onlyChatAndHistoryTabs?: boolean
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface TabConfig {
    Icon: IconComponent
    view: View
    tooltip: React.ReactNode
    command?: string
    SubIcons?: { tooltip: React.ReactNode; Icon: IconComponent; command: string }[]
    changesView?: boolean
}

interface TabButtonProps {
    Icon: IconComponent
    view?: View
    command?: string
    isActive?: boolean
    onClick: () => void
    prominent?: boolean
    tooltip: React.ReactNode
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
    ({ Icon, isActive, onClick, tooltip, prominent }, ref) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onClick}
                    ref={ref}
                    className={clsx(
                        'tw-py-3 tw-px-2 tw-opacity-80 hover:tw-opacity-100 tw-border-b-[1px] tw-border-transparent tw-transition tw-translate-y-[1px]',
                        {
                            '!tw-opacity-100 !tw-border-[var(--vscode-tab-activeBorderTop)]': isActive,
                            '!tw-opacity-100': prominent,
                        }
                    )}
                >
                    <Icon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    )
)
TabButton.displayName = 'TabButton'

const BASE_TAB_ITEMS: TabConfig[] = [
    {
        view: View.Chat,
        tooltip: 'Chat',
        Icon: MessagesSquareIcon,
        SubIcons: [
            {
                tooltip: (
                    <>
                        New Chat <Kbd macOS="shift+opt+l" linuxAndWindows="shift+alt+l" />
                    </>
                ),
                Icon: MessageSquarePlusIcon,
                command: 'cody.chat.new',
            },
            {
                tooltip: 'Open in Editor',
                Icon: ColumnsIcon,
                command: 'cody.chat.moveToEditor',
            },
        ],
        changesView: true,
    },
    {
        view: View.History,
        tooltip: 'Chat History',
        Icon: HistoryIcon,
        SubIcons: [
            { tooltip: 'Export History', Icon: DownloadIcon, command: 'cody.chat.history.export' },
            { tooltip: 'Clear History', Icon: Trash2Icon, command: 'cody.chat.history.clear' },
        ],
        changesView: true,
    },
    {
        view: View.Commands,
        tooltip: 'Commands',
        Icon: ZapIcon,
        changesView: true,
    },
    {
        view: View.Settings,
        tooltip: 'Settings',
        Icon: SettingsIcon,
        command: 'cody.status-bar.interacted',
    },
    {
        view: View.Account,
        tooltip: 'Account',
        Icon: CircleUserIcon,
        command: 'cody.auth.account',
    },
]

const getTabItemsByIDE = (IDE: CodyIDE): TabConfig[] =>
    IDE !== CodyIDE.VSCode
        ? BASE_TAB_ITEMS.map(item =>
              item.view === View.Account ? { ...item, changesView: true } : item
          )
        : BASE_TAB_ITEMS

export const TabsBar: React.FC<TabsBarProps> = ({
    currentView,
    setView,
    IDE,
    onlyChatAndHistoryTabs,
}) => {
    const tabItems = useMemo(
        () =>
            getTabItemsByIDE(IDE).filter(tab =>
                onlyChatAndHistoryTabs ? tab.view === View.Chat || tab.view === View.History : true
            ),
        [IDE, onlyChatAndHistoryTabs]
    )
    const currentViewSubIcons = tabItems.find(tab => tab.view === currentView)?.SubIcons

    const handleClick = useCallback(
        (view: View, command?: string, changesView?: boolean) => {
            if (command) {
                getVSCodeAPI().postMessage({ command: 'command', id: command })
            }
            if (changesView) {
                setView(view)
            }
        },
        [setView]
    )

    return (
        <Tabs.List
            aria-label="cody-webview"
            className={clsx(
                'tw-flex tw-justify-between tw-sticky tw-top-0 tw-z-50 tw-w-full tw-border-b tw-border-border tw-pl-[15px] tw-pr-4',
                styles.tabsContainer
            )}
        >
            <div className="tw-flex tw-gap-1">
                {tabItems.map(({ Icon, view, command, tooltip, changesView }) => (
                    <Tabs.Trigger key={view} value={view} asChild={true}>
                        <TabButton
                            Icon={Icon}
                            view={view}
                            tooltip={tooltip}
                            command={command}
                            isActive={currentView === view}
                            onClick={() => handleClick(view, command, changesView)}
                        />
                    </Tabs.Trigger>
                ))}
            </div>
            {!onlyChatAndHistoryTabs && (
                <div className="tw-flex tw-gap-4">
                    {currentViewSubIcons?.map(({ Icon, command, tooltip }) => (
                        <TabButton
                            key={command}
                            Icon={Icon}
                            tooltip={tooltip}
                            command={command}
                            onClick={() =>
                                getVSCodeAPI().postMessage({ command: 'command', id: command })
                            }
                            prominent
                        />
                    ))}
                </div>
            )}
        </Tabs.List>
    )
}

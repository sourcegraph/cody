import * as Tabs from '@radix-ui/react-tabs'
import clsx from 'clsx'
import {
    CircleUserIcon,
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

import styles from './TabsBar.module.css'

interface TabsBarProps {
    currentView: View
    setView: (view?: View) => void
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface TabConfig {
    Icon: IconComponent
    view: View
    command?: string
    SubIcons?: { title: string; Icon: IconComponent; command: string }[]
}

const tabItems: TabConfig[] = [
    {
        view: View.Chat,
        Icon: MessagesSquareIcon,
        SubIcons: [{ title: 'New Chat', Icon: MessageSquarePlusIcon, command: 'cody.chat.newPanel' }],
    },
    {
        view: View.History,
        Icon: HistoryIcon,
        SubIcons: [
            { title: 'Export History', Icon: DownloadIcon, command: 'cody.chat.history.export' },
            { title: 'Clear History', Icon: Trash2Icon, command: 'cody.chat.history.clear' },
        ],
    },
    {
        view: View.Commands,
        Icon: ZapIcon,
    },
    { view: View.Settings, Icon: SettingsIcon, command: 'cody.status-bar.interacted' },
    { view: View.Account, Icon: CircleUserIcon, command: 'cody.auth.account' },
]

interface TabButtonProps {
    Icon: IconComponent
    view?: View
    command?: string
    isActive?: boolean
    onClick: () => void
}

const baseClasses =
    'tw-rounded-none tw-bg-transparent tw-border-solid tw-border-b tw-px-2 tw-py-4 tw-transition-all hover:tw-text-button-background-hover'
const activeClasses = 'tw-border-button-background-hover tw-text-button-background-hover'
const inactiveClasses = 'tw-border-transparent'

const TabButton: React.FC<TabButtonProps> = ({ Icon, isActive, onClick, view }) => (
    <button
        title={view}
        type="button"
        onClick={onClick}
        className={clsx(baseClasses, isActive ? activeClasses : inactiveClasses)}
    >
        <Icon size={16} strokeWidth={1.25} />
    </button>
)

export const TabsBar: React.FC<TabsBarProps> = ({ currentView, setView }) => {
    const handleClick = (view: View, command?: string) => {
        if (command) {
            getVSCodeAPI().postMessage({ command: 'command', id: command })
        }
        setView(view)
    }

    const currentViewSubIcons = tabItems.find(tab => tab.view === currentView)?.SubIcons

    return (
        <Tabs.List
            aria-label="cody-webview"
            className={clsx(
                'tw-flex tw-justify-between tw-sticky tw-top-0 tw-z-50 tw-w-full tw-border-b tw-border-border tw-shadow-lg tw-shadow-border-500/50 tw-my-1 tw-px-4',
                styles.tabsContainer
            )}
        >
            <div className="tw-flex tw-gap-4">
                {tabItems.map(({ Icon, view, command }) => (
                    <Tabs.Trigger key={view} value={view}>
                        <TabButton
                            Icon={Icon}
                            view={view}
                            command={command}
                            isActive={currentView === view}
                            onClick={() => handleClick(view, command)}
                        />
                    </Tabs.Trigger>
                ))}
            </div>
            <div className="tw-flex tw-gap-4">
                {currentViewSubIcons?.map(({ Icon, command }) => (
                    <TabButton
                        key={command}
                        Icon={Icon}
                        command={command}
                        onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: command })}
                    />
                ))}
            </div>
        </Tabs.List>
    )
}

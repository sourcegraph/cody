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
import styles from './TabsBar.module.css'

export enum View {
    Chat = 'chat',
    Login = 'login',
    History = 'history',
    Account = 'account',
    Commands = 'commands',
    Settings = 'settings',
}

interface TabsBarProps {
    currentView: View
    setView: (view?: View) => void
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface IconConfig {
    Icon: IconComponent
    view: View
    command?: string
    RightIcons?: { Icon: IconComponent; command: string }[]
}

const icons: IconConfig[] = [
    {
        Icon: MessagesSquareIcon,
        view: View.Chat,
        RightIcons: [{ Icon: MessageSquarePlusIcon, command: 'cody.chat.newPanel' }],
    },
    {
        Icon: HistoryIcon,
        view: View.History,
        RightIcons: [
            { Icon: DownloadIcon, command: 'cody.chat.history.export' },
            { Icon: Trash2Icon, command: 'cody.chat.history.clear' },
        ],
    },
    { Icon: ZapIcon, view: View.Commands },
    { Icon: SettingsIcon, command: 'cody.status-bar.interacted', view: View.Settings },
    { Icon: CircleUserIcon, command: 'cody.auth.account', view: View.Account },
]

export const TabsBar: React.FC<TabsBarProps> = ({ currentView, setView }) => {
    const baseClasses =
        'tw-rounded-none tw-bg-transparent tw-border-solid tw-border-b tw-px-2 tw-py-4 tw-transition-all hover:tw-text-button-background'
    const activeClasses = 'tw-border-button-background tw-text-button-background'
    const inactiveClasses = 'tw-border-transparent'

    // const currentViewRightIcons = icons.find(icon => icon.view === currentView)?.RightIcons

    const handleClick = (view: View, command?: string) => {
        if (command) {
            getVSCodeAPI().postMessage({ command: 'command', id: command })
        }
        setView(view)
    }
    const currentViewRightIcons = icons.find(icon => icon.view === currentView)?.RightIcons

    return (
        <Tabs.List
            aria-label="cody-webview"
            className={clsx(
                'tw-flex tw-justify-between tw-sticky tw-top-0 tw-z-50 tw-w-full tw-border-b tw-border-border tw-my-1 tw-px-4',
                styles.tabsContainer
            )}
        >
            <div>
                {icons.map(({ Icon, view, command }) => (
                    <Tabs.Trigger key={view} value={view}>
                        <button
                            type="button"
                            onClick={() => handleClick(view, command)}
                            className={clsx(
                                baseClasses,
                                currentView === view ? activeClasses : inactiveClasses
                            )}
                        >
                            <Icon size={16} strokeWidth={1.25} />
                        </button>
                    </Tabs.Trigger>
                ))}
            </div>
            <div>
                {currentViewRightIcons?.map(({ Icon, command }) => (
                    <button
                        type="button"
                        key={command}
                        className={clsx(baseClasses, inactiveClasses)}
                        onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: command })}
                    >
                        <Icon size={16} strokeWidth={1.25} />
                    </button>
                ))}
            </div>
        </Tabs.List>
    )
}

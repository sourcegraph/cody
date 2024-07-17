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
import styles from './NavBar.module.css'
import { getVSCodeAPI } from './utils/VSCodeApi'

export enum View {
    Chat = 'chat',
    Login = 'login',
    History = 'history',
    Account = 'account',
    Commands = 'commands',
    Settings = 'settings',
}

interface NavBarProps {
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

export const NavBar: React.FC<NavBarProps> = ({ currentView, setView }) => {
    const baseClasses =
        'tw-rounded-none tw-bg-transparent tw-border-solid tw-border-b tw-px-2 tw-pb-4 tw-transition-all hover:tw-opacity-100'
    const activeClasses = 'tw-opacity-100 tw-border-foreground'
    const inactiveClasses = 'tw-opacity-50 tw-border-transparent'

    const currentViewRightIcons = icons.find(icon => icon.view === currentView)?.RightIcons

    const handleClick = (view: View, command?: string) => {
        setView(view)
        if (command) {
            getVSCodeAPI().postMessage({ command: 'command', id: command })
        }
    }

    return (
        <div
            className={clsx(
                'tw-flex tw-justify-between tw-sticky tw-top-0 tw-z-50 tw-w-full tw-border-b tw-border-border tw-mb-1 tw-px-2',
                styles.navbarContainer
            )}
        >
            <div>
                {icons.map(({ Icon, view, command }) => (
                    <button
                        type="button"
                        key={view}
                        onClick={() => handleClick(view, command)}
                        className={clsx(
                            baseClasses,
                            currentView === view ? activeClasses : inactiveClasses
                        )}
                    >
                        <Icon size={16} />
                    </button>
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
                        <Icon size={16} />
                    </button>
                ))}
            </div>
        </div>
    )
}

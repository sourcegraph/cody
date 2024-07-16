import clsx from 'clsx'
import {
    CircleUserIcon,
    DownloadIcon,
    HistoryIcon,
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

const icons = [
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
    { Icon: SettingsIcon, view: View.Settings },
    { Icon: CircleUserIcon, view: View.Account },
]

export const NavBar: React.FC<NavBarProps> = ({ currentView, setView }) => {
    const baseClasses =
        'tw-rounded-none tw-bg-transparent tw-border-solid tw-border-b-4 tw-px-2 tw-py-3 tw-transition-all hover:tw-opacity-100'
    const activeClasses = 'tw-opacity-100 tw-border-foreground'
    const inactiveClasses = 'tw-opacity-50 tw-border-transparent'

    const currentViewRightIcons = icons.find(({ view }) => view === currentView)?.RightIcons

    return (
        <div
            className={clsx(
                'tw-flex tw-justify-between tw-sticky tw-top-0 tw-z-50 tw-w-full tw-border-b-2 tw-border-border tw-my-3',
                styles.navbarContainer
            )}
        >
            <div>
                {icons.map(({ Icon, view }) => (
                    <button
                        type="button"
                        key={view}
                        onClick={() => setView(view as View)}
                        className={`${baseClasses} ${
                            currentView === view ? activeClasses : inactiveClasses
                        }`}
                    >
                        <Icon size={16} />
                    </button>
                ))}
            </div>
            <div>
                {currentViewRightIcons?.map(({ Icon, command }) => (
                    <button
                        type="button"
                        key={Icon.displayName}
                        className={`${baseClasses} ${inactiveClasses}`}
                        onClick={() => getVSCodeAPI().postMessage({ command: 'command', id: command })}
                    >
                        <Icon size={16} />
                    </button>
                ))}
            </div>
        </div>
    )
}

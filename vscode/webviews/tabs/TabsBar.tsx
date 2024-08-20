import * as Tabs from '@radix-ui/react-tabs'
import clsx from 'clsx'
import {
    BookTextIcon,
    CircleUserIcon,
    ColumnsIcon,
    DownloadIcon,
    HistoryIcon,
    type LucideProps,
    MessageSquarePlusIcon,
    MessagesSquareIcon,
    SettingsIcon,
    Trash2Icon,
} from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'

import { CodyIDE, isDefined } from '@sourcegraph/cody-shared'
import { forwardRef, useCallback, useMemo } from 'react'
import { Kbd } from '../components/Kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import { useConfig } from '../utils/useConfig'
import styles from './TabsBar.module.css'

interface TabsBarProps {
    IDE: CodyIDE
    currentView: View
    setView: (view: View) => void
    onDownloadChatClick?: () => void
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface TabConfig {
    Icon: IconComponent
    view: View
    title: string
    command?: string
    SubIcons?: {
        /** Extra content to display in the tooltip (in addition to the title). */
        tooltipExtra?: React.ReactNode

        title: string
        alwaysShowTitle?: boolean
        Icon: IconComponent
        command: string
        arg?: string | undefined | null
        callback?: () => void
    }[]
    changesView?: boolean
}

interface TabButtonProps {
    Icon: IconComponent
    view?: View
    command?: string
    isActive?: boolean
    onClick: () => void
    prominent?: boolean
    title: string
    alwaysShowTitle?: boolean

    /** Extra content to display in the tooltip (in addition to the title). */
    tooltipExtra?: React.ReactNode

    'data-testid'?: string
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
    (
        {
            Icon,
            isActive,
            onClick,
            title,
            alwaysShowTitle,
            tooltipExtra,
            prominent,
            'data-testid': dataTestId,
        },
        ref
    ) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onClick}
                    ref={ref}
                    className={clsx(
                        'tw-flex tw-gap-3 tw-items-center tw-leading-none tw-py-3 tw-px-2 tw-opacity-80 hover:tw-opacity-100 tw-border-b-[1px] tw-border-transparent tw-transition tw-translate-y-[1px]',
                        {
                            '!tw-opacity-100 !tw-border-[var(--vscode-tab-activeBorderTop)]': isActive,
                            '!tw-opacity-100': prominent,
                        }
                    )}
                    data-testid={dataTestId}
                >
                    <Icon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                    <span className={alwaysShowTitle ? '' : 'tw-hidden md:tw-inline'}>{title}</span>
                </button>
            </TooltipTrigger>
            <TooltipContent className="md:tw-hidden">
                {title} {tooltipExtra}
            </TooltipContent>
        </Tooltip>
    )
)
TabButton.displayName = 'TabButton'

export const TabsBar: React.FC<TabsBarProps> = ({ currentView, setView, IDE, onDownloadChatClick }) => {
    const {
        config: { webviewType, multipleWebviewsEnabled },
    } = useConfig()

    const tabItems = useMemo<TabConfig[]>(
        () =>
            (
                [
                    {
                        view: View.Chat,
                        title: 'Chat',
                        Icon: MessagesSquareIcon,
                        SubIcons: [
                            {
                                title: 'New Chat',
                                alwaysShowTitle: true,
                                tooltipExtra: (
                                    <>
                                        {IDE === CodyIDE.VSCode && (
                                            <Kbd macOS="shift+opt+l" linuxAndWindows="shift+alt+l" />
                                        )}
                                    </>
                                ),
                                Icon: MessageSquarePlusIcon,
                                command:
                                    IDE === CodyIDE.Web
                                        ? 'cody.chat.new'
                                        : webviewType === 'sidebar' || !multipleWebviewsEnabled
                                          ? 'cody.chat.newPanel'
                                          : 'cody.chat.newEditorPanel',
                            },
                            multipleWebviewsEnabled && {
                                title: 'Open in Editor',
                                Icon: ColumnsIcon,
                                command: 'cody.chat.moveToEditor',
                            },
                        ].filter(isDefined),
                        changesView: true,
                    },
                    {
                        view: View.History,
                        title: 'History',
                        Icon: HistoryIcon,
                        SubIcons: [
                            {
                                title: 'Export History',
                                Icon: DownloadIcon,
                                command: 'cody.chat.history.export',
                                callback: onDownloadChatClick,
                            },
                            {
                                title: 'Clear Chat History',
                                Icon: Trash2Icon,
                                command: 'cody.chat.history.clear',
                                // We don't have a way to request user confirmation in Cody Web
                                // (vscode.window.showWarningMessage is not implemented), so bypass
                                // confirmation.
                                arg: IDE === CodyIDE.VSCode ? undefined : 'clear-all-no-confirm',
                            },
                        ].filter(isDefined),
                        changesView: true,
                    },
                    {
                        view: View.Prompts,
                        title: IDE === CodyIDE.Web ? 'Prompts' : 'Prompts & Commands',
                        Icon: BookTextIcon,
                        changesView: true,
                    },
                    multipleWebviewsEnabled && {
                        view: View.Settings,
                        title: 'Settings',
                        Icon: SettingsIcon,
                        command: 'cody.status-bar.interacted',
                    },
                    IDE !== CodyIDE.Web && {
                        view: View.Account,
                        title: 'Account',
                        Icon: CircleUserIcon,
                        command: 'cody.auth.account',
                        changesView: IDE !== CodyIDE.VSCode,
                    },
                ] as (TabConfig | null)[]
            ).filter(isDefined),
        [IDE, webviewType, onDownloadChatClick, multipleWebviewsEnabled]
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
            <div className="tw-flex tw-gap-1 [&_>_*]:tw-flex-shrink-0">
                {tabItems.map(({ Icon, view, command, title, changesView }) => (
                    <Tabs.Trigger key={view} value={view} asChild={true}>
                        <TabButton
                            Icon={Icon}
                            view={view}
                            title={title}
                            command={command}
                            isActive={currentView === view}
                            onClick={() => handleClick(view, command, changesView)}
                            data-testid={`tab-${view}`}
                        />
                    </Tabs.Trigger>
                ))}
            </div>
            <div className="tw-flex tw-gap-4 [&_>_*]:tw-flex-shrink-0">
                {currentViewSubIcons?.map(
                    ({ Icon, command, title, alwaysShowTitle, tooltipExtra, arg, callback }) => (
                        <TabButton
                            key={command}
                            Icon={Icon}
                            title={title}
                            alwaysShowTitle={alwaysShowTitle}
                            tooltipExtra={tooltipExtra}
                            command={command}
                            onClick={() =>
                                callback
                                    ? callback()
                                    : getVSCodeAPI().postMessage({
                                          command: 'command',
                                          id: command,
                                          arg,
                                      })
                            }
                            prominent
                        />
                    )
                )}
            </div>
        </Tabs.List>
    )
}

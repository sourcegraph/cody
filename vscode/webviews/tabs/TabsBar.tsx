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
import styles from './TabsBar.module.css'

interface TabsBarProps {
    IDE: CodyIDE
    currentView: View
    setView: (view: View) => void
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface TabConfig {
    Icon: IconComponent
    view: View
    tooltip: React.ReactNode
    command?: string
    SubIcons?: {
        tooltip: React.ReactNode
        Icon: IconComponent
        command: string
        arg?: string | undefined | null
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
    tooltip: React.ReactNode
    'data-testid'?: string
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
    ({ Icon, isActive, onClick, tooltip, prominent, 'data-testid': dataTestId }, ref) => (
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
                    data-testid={dataTestId}
                >
                    <Icon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
    )
)
TabButton.displayName = 'TabButton'

export const TabsBar: React.FC<TabsBarProps> = ({ currentView, setView, IDE }) => {
    const tabItems = useMemo<TabConfig[]>(
        () =>
            (
                [
                    {
                        view: View.Chat,
                        tooltip: 'Chat',
                        Icon: MessagesSquareIcon,
                        SubIcons: [
                            {
                                tooltip: (
                                    <>
                                        New Chat{' '}
                                        {IDE !== CodyIDE.Web && (
                                            <Kbd macOS="shift+opt+l" linuxAndWindows="shift+alt+l" />
                                        )}
                                    </>
                                ),
                                Icon: MessageSquarePlusIcon,
                                command: 'cody.chat.new',
                            },
                            IDE !== CodyIDE.Web
                                ? {
                                      tooltip: 'Open in Editor',
                                      Icon: ColumnsIcon,
                                      command: 'cody.chat.moveToEditor',
                                  }
                                : null,
                        ].filter(isDefined),
                        changesView: true,
                    },
                    {
                        view: View.History,
                        tooltip: 'Chat History',
                        Icon: HistoryIcon,
                        SubIcons: [
                            IDE !== CodyIDE.Web
                                ? {
                                      tooltip: 'Export History',
                                      Icon: DownloadIcon,
                                      command: 'cody.chat.history.export',
                                  }
                                : null,
                            {
                                tooltip: 'Clear History',
                                Icon: Trash2Icon,
                                command: 'cody.chat.history.clear',
                                // We don't have a way to request user confirmation in Cody Web
                                // (vscode.window.showWarningMessage is not implemented), so bypass
                                // confirmation.
                                arg: IDE === CodyIDE.Web ? 'clear-all-no-confirm' : undefined,
                            },
                        ].filter(isDefined),
                        changesView: true,
                    },
                    {
                        view: View.Prompts,
                        tooltip: 'Prompts',
                        Icon: BookTextIcon,
                        changesView: true,
                    },
                    IDE !== CodyIDE.Web
                        ? {
                              view: View.Settings,
                              tooltip: 'Settings',
                              Icon: SettingsIcon,
                              command: 'cody.status-bar.interacted',
                          }
                        : null,
                    IDE !== CodyIDE.Web
                        ? {
                              view: View.Account,
                              tooltip: 'Account',
                              Icon: CircleUserIcon,
                              command: 'cody.auth.account',
                              changesView: IDE !== CodyIDE.VSCode,
                          }
                        : null,
                ] as (TabConfig | null)[]
            ).filter(isDefined),
        [IDE]
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
                            data-testid={`tab-${view}`}
                        />
                    </Tabs.Trigger>
                ))}
            </div>
            <div className="tw-flex tw-gap-4">
                {currentViewSubIcons?.map(({ Icon, command, tooltip, arg }) => (
                    <TabButton
                        key={command}
                        Icon={Icon}
                        tooltip={tooltip}
                        command={command}
                        onClick={() =>
                            getVSCodeAPI().postMessage({ command: 'command', id: command, arg })
                        }
                        prominent
                    />
                ))}
            </div>
        </Tabs.List>
    )
}

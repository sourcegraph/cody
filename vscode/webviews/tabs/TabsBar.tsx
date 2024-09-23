import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'

import clsx from 'clsx'
import {
    BookTextIcon,
    CircleUserIcon,
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
import { type FC, Fragment, forwardRef, useCallback, useMemo, useState } from 'react'
import { Kbd } from '../components/Kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import { useConfig } from '../utils/useConfig'

import { Button } from '../components/shadcn/ui/button'
import styles from './TabsBar.module.css'
import { getCreateNewChatCommand } from './utils'

interface TabsBarProps {
    IDE: CodyIDE
    currentView: View
    isUnifiedPromptsAvailable: boolean
    setView: (view: View) => void
    onDownloadChatClick?: () => void
}

type IconComponent = React.ForwardRefExoticComponent<
    Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>

interface TabSubAction {
    /** Extra content to display in the tooltip (in addition to the title). */
    tooltipExtra?: React.ReactNode

    title: string
    Icon: IconComponent
    command: string
    arg?: string | undefined | null
    callback?: () => void
    confirmation?: {
        title: string
        description: string
        confirmationAction: string
    }
}

interface TabConfig {
    Icon: IconComponent
    view: View
    title: string
    command?: string
    changesView?: boolean
    subActions?: TabSubAction[]
}

export const TabsBar: React.FC<TabsBarProps> = ({
    currentView,
    isUnifiedPromptsAvailable,
    setView,
    IDE,
    onDownloadChatClick,
}) => {
    const tabItems = useTabs({ IDE, isUnifiedPromptsAvailable, onDownloadChatClick })
    const {
        config: { webviewType, multipleWebviewsEnabled },
    } = useConfig()
    const currentViewSubActions = tabItems.find(tab => tab.view === currentView)?.subActions ?? []

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

    const handleSubActionClick = useCallback(
        (action: Pick<TabSubAction, 'callback' | 'command' | 'arg'>) => {
            if (action.callback) {
                action.callback()
            } else {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: action.command,
                    arg: action.arg,
                })
            }
        },
        []
    )

    return (
        <div className={clsx(styles.tabsRoot, { [styles.tabsRootCodyWeb]: IDE === CodyIDE.Web })}>
            <Tabs.List aria-label="cody-webview" className={styles.tabsContainer}>
                <div className={styles.tabs}>
                    {tabItems.map(({ Icon, view, command, title, changesView }) => (
                        <Tabs.Trigger key={view} value={view} asChild={true}>
                            <TabButton
                                Icon={Icon}
                                view={view}
                                title={title}
                                IDE={IDE}
                                isActive={currentView === view}
                                onClick={() => handleClick(view, command, changesView)}
                                data-testid={`tab-${view}`}
                            />
                        </Tabs.Trigger>
                    ))}

                    <div className="tw-ml-auto">
                        <TabButton
                            prominent
                            Icon={MessageSquarePlusIcon}
                            title="New Chat"
                            IDE={IDE}
                            alwaysShowTitle={true}
                            tooltipExtra={
                                <>
                                    {IDE === CodyIDE.VSCode && (
                                        <Kbd macOS="shift+opt+l" linuxAndWindows="shift+alt+l" />
                                    )}
                                </>
                            }
                            onClick={() =>
                                handleSubActionClick({
                                    command: getCreateNewChatCommand({
                                        IDE,
                                        webviewType,
                                        multipleWebviewsEnabled,
                                    }),
                                })
                            }
                        />
                    </div>
                </div>
                <div className={styles.subTabs}>
                    {currentViewSubActions.map(subAction => (
                        <Fragment key={subAction.command}>
                            {subAction.confirmation ? (
                                <ActionButtonWithConfirmation
                                    title={subAction.title}
                                    Icon={subAction.Icon}
                                    IDE={IDE}
                                    alwaysShowTitle={true}
                                    tooltipExtra={subAction.tooltipExtra}
                                    dialogTitle={subAction.confirmation.title}
                                    dialogDescription={subAction.confirmation.description}
                                    dialogConfirmAction={subAction.confirmation.confirmationAction}
                                    onConfirm={() => handleSubActionClick(subAction)}
                                />
                            ) : (
                                <TabButton
                                    Icon={subAction.Icon}
                                    title={subAction.title}
                                    IDE={IDE}
                                    alwaysShowTitle={true}
                                    tooltipExtra={subAction.tooltipExtra}
                                    onClick={() => handleSubActionClick(subAction)}
                                />
                            )}
                        </Fragment>
                    ))}
                </div>
            </Tabs.List>
        </div>
    )
}

interface ActionButtonWithConfirmationProps {
    title: string
    Icon: IconComponent
    IDE: CodyIDE
    prominent?: boolean
    alwaysShowTitle?: boolean
    /** Extra content to display in the tooltip (in addition to the title). */
    tooltipExtra?: React.ReactNode
    onConfirm: () => void
    dialogTitle: string
    dialogDescription: string
    dialogConfirmAction: string
}

/**
 * Renders common sub tab action but with additional confirmation dialog UI
 * It's used for heavy undoable actions like clear history item in history tab
 */
const ActionButtonWithConfirmation: FC<ActionButtonWithConfirmationProps> = props => {
    const {
        title,
        Icon,
        IDE,
        prominent,
        alwaysShowTitle,
        tooltipExtra,
        onConfirm,
        dialogTitle,
        dialogConfirmAction,
        dialogDescription,
    } = props

    const [state, setState] = useState<boolean>(false)

    return (
        <Dialog.Root open={state} onOpenChange={setState}>
            <TabButton
                Icon={Icon}
                title={title}
                alwaysShowTitle={alwaysShowTitle}
                tooltipExtra={tooltipExtra}
                prominent={prominent}
                IDE={IDE}
                onClick={() => setState(true)}
            />

            <Dialog.Portal>
                <Dialog.Overlay className={styles.dialogOverlay} />
                <Dialog.Content className={styles.dialogContent} data-cody-ui-dialog>
                    <Dialog.Title className={styles.dialogTitle}>{dialogTitle}</Dialog.Title>

                    <Dialog.Description className={styles.dialogDescription}>
                        {dialogDescription}
                    </Dialog.Description>

                    <footer className={styles.dialogFooter}>
                        <Button variant="secondary" onClick={() => setState(false)}>
                            Cancel
                        </Button>

                        <Button
                            variant="default"
                            onClick={() => {
                                onConfirm()
                                setState(false)
                            }}
                        >
                            {dialogConfirmAction}
                        </Button>
                    </footer>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

interface TabButtonProps {
    title: string
    Icon: IconComponent
    IDE: CodyIDE
    view?: View
    isActive?: boolean
    onClick?: () => void
    prominent?: boolean
    alwaysShowTitle?: boolean

    /** Extra content to display in the tooltip (in addition to the title). */
    tooltipExtra?: React.ReactNode
    'data-testid'?: string
}

export const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>((props, ref) => {
    const {
        IDE,
        Icon,
        isActive,
        onClick,
        title,
        alwaysShowTitle,
        tooltipExtra,
        prominent,
        'data-testid': dataTestId,
    } = props

    return (
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
                    <span className={alwaysShowTitle ? '' : styles.tabActionLabel}>{title}</span>
                </button>
            </TooltipTrigger>
            <TooltipContent portal={IDE === CodyIDE.Web}>
                {title} {tooltipExtra}
            </TooltipContent>
        </Tooltip>
    )
})

TabButton.displayName = 'TabButton'

/**
 * Returns list of tabs and its sub-action buttons, used later as configuration for
 * tabs rendering in chat header.
 */
function useTabs(
    input: Pick<TabsBarProps, 'IDE' | 'isUnifiedPromptsAvailable' | 'onDownloadChatClick'>
): TabConfig[] {
    const { isUnifiedPromptsAvailable, IDE, onDownloadChatClick } = input
    const {
        config: { multipleWebviewsEnabled },
    } = useConfig()

    return useMemo<TabConfig[]>(
        () =>
            (
                [
                    {
                        view: View.Chat,
                        title: 'Chat',
                        Icon: MessagesSquareIcon,
                        changesView: true,
                    },
                    {
                        view: View.History,
                        title: 'History',
                        Icon: HistoryIcon,
                        subActions: [
                            {
                                title: 'Export',
                                Icon: DownloadIcon,
                                command: 'cody.chat.history.export',
                                callback: onDownloadChatClick,
                            },
                            {
                                title: 'Delete all',
                                Icon: Trash2Icon,
                                command: 'cody.chat.history.clear',

                                // Show Cody Chat UI confirmation modal with this message only for
                                // Cody Web. All other IDE either implements their own native confirmation UI
                                // or don't have confirmation UI at all.
                                confirmation:
                                    IDE === CodyIDE.Web
                                        ? {
                                              title: 'Are you sure you want to delete all of your chats?',
                                              description:
                                                  'You will not be able to recover them once deleted.',
                                              confirmationAction: 'Delete all chats',
                                          }
                                        : undefined,

                                // We don't have a way to request user confirmation in Cody Agent
                                // (vscode.window.showWarningMessage is overridable there), so bypass
                                // confirmation in cody agent and use confirmation UI above.
                                arg: IDE === CodyIDE.VSCode ? undefined : 'clear-all-no-confirm',
                            },
                        ].filter(isDefined),
                        changesView: true,
                    },
                    {
                        view: View.Prompts,
                        title:
                            IDE === CodyIDE.Web || isUnifiedPromptsAvailable
                                ? 'Prompts'
                                : 'Prompts & Commands',
                        Icon: BookTextIcon,
                        changesView: true,
                    },
                    multipleWebviewsEnabled
                        ? {
                              view: View.Settings,
                              title: 'Settings',
                              Icon: SettingsIcon,
                              command: 'cody.status-bar.interacted',
                          }
                        : null,
                    IDE !== CodyIDE.Web
                        ? {
                              view: View.Account,
                              title: 'Account',
                              Icon: CircleUserIcon,
                              command: 'cody.auth.account',
                              changesView: IDE !== CodyIDE.VSCode,
                          }
                        : null,
                ] as (TabConfig | null)[]
            ).filter(isDefined),
        [IDE, onDownloadChatClick, multipleWebviewsEnabled, isUnifiedPromptsAvailable]
    )
}

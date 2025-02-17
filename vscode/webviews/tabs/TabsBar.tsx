import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'

import clsx from 'clsx'
import {
    BookTextIcon,
    HistoryIcon,
    type LucideProps,
    MessageSquarePlusIcon,
    MessagesSquareIcon,
} from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'

import { type AuthenticatedAuthStatus, CodyIDE, isDefined } from '@sourcegraph/cody-shared'
import { isEqual } from 'lodash'
import { type FC, Fragment, forwardRef, memo, useCallback, useMemo, useState } from 'react'
import type { UserAccountInfo } from '../Chat'
import { Kbd } from '../components/Kbd'
import { UserMenu } from '../components/UserMenu'
import { Button } from '../components/shadcn/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import { useConfig } from '../utils/useConfig'
import styles from './TabsBar.module.css'
import { getCreateNewChatCommand } from './utils'

interface TabsBarProps {
    user: UserAccountInfo
    currentView: View
    setView: (view: View) => void
    endpointHistory: string[]
    // Whether to show the Sourcegraph Teams upgrade CTA or not.
    isWorkspacesUpgradeCtaEnabled?: boolean
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
    changesView?: View
    uri?: string
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

export const TabsBar = memo<TabsBarProps>(props => {
    const { currentView, setView, user, endpointHistory } = props
    const { isCodyProUser, IDE } = user
    const tabItems = useTabs()
    const {
        config: { webviewType, multipleWebviewsEnabled, allowEndpointChange },
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
        (action: Pick<TabSubAction, 'callback' | 'command' | 'arg' | 'changesView'>) => {
            if (action.callback) {
                action.callback()
            } else {
                getVSCodeAPI().postMessage({
                    command: 'command',
                    id: action.command,
                    arg: action.arg,
                })
            }
            if (action.changesView) {
                setView(action.changesView)
            }
        },
        [setView]
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

                    <div className="tw-flex tw-ml-auto">
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
                            view={View.Chat}
                            onClick={() =>
                                handleSubActionClick({
                                    changesView: View.Chat,
                                    command: getCreateNewChatCommand({
                                        IDE,
                                        webviewType,
                                        multipleWebviewsEnabled,
                                    }),
                                })
                            }
                        />
                        {IDE !== CodyIDE.Web && (
                            <UserMenu
                                authStatus={user.user as AuthenticatedAuthStatus}
                                isProUser={isCodyProUser}
                                endpointHistory={endpointHistory}
                                allowEndpointChange={allowEndpointChange}
                                className="!tw-opacity-100 tw-h-full"
                                isWorkspacesUpgradeCtaEnabled={props.isWorkspacesUpgradeCtaEnabled}
                            />
                        )}
                    </div>
                </div>
                <div className={styles.subTabs}>
                    {currentViewSubActions.map(subAction => (
                        <Fragment key={`${subAction.command}/${subAction.uri ?? ''}`}>
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
                                    uri={subAction.uri}
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
}, isEqual)

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
    uri?: string
    view?: View
    isActive?: boolean
    onClick?: () => void
    prominent?: boolean
    alwaysShowTitle?: boolean

    /** Extra content to display in the tooltip (in addition to the title). */
    tooltipExtra?: React.ReactNode
    'data-testid'?: string
}

const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>((props, ref) => {
    const {
        IDE,
        Icon,
        isActive,
        uri,
        onClick,
        title,
        alwaysShowTitle,
        tooltipExtra,
        prominent,
        'data-testid': dataTestId,
    } = props

    const Component = uri ? 'a' : 'button'

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Component
                    type={uri ? undefined : 'button'}
                    onClick={uri ? undefined : onClick}
                    href={uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    ref={ref as any}
                    className={clsx(
                        'tw-flex tw-gap-2 tw-items-center !tw-font-normal !tw-text-inherit tw-leading-none tw-p-2 tw-opacity-80 hover:tw-opacity-100 tw-border-transparent tw-transition tw-translate-y-[1px] tw-text-sm',
                        {
                            '!tw-opacity-100 !tw-border-[var(--vscode-tab-activeBorderTop)] tw-border-b-[1px]':
                                isActive,
                            '!tw-opacity-100': prominent,
                        }
                    )}
                    data-testid={dataTestId}
                >
                    <Icon size={16} strokeWidth={1.25} className="tw-w-8 tw-h-8" />
                    {alwaysShowTitle ? (
                        <span>{title}</span>
                    ) : (
                        <span className={styles.tabActionLabel}>{title}</span>
                    )}
                </Component>
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
function useTabs(): TabConfig[] {
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

                        changesView: true,
                    },
                    {
                        view: View.Prompts,
                        title: 'Prompts',
                        Icon: BookTextIcon,
                        changesView: true,
                    },
                ] as (TabConfig | null)[]
            ).filter(isDefined),
        []
    )
}

import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'

import clsx from 'clsx'
import {
    BookTextIcon,
    DownloadIcon,
    HistoryIcon,
    type LucideProps,
    PlusIcon,
    Trash2Icon,
} from 'lucide-react'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { View } from './types'

import { type AuthenticatedAuthStatus, CodyIDE, type Model, isDefined } from '@sourcegraph/cody-shared'
import {
    type FC,
    Fragment,
    type FunctionComponent,
    forwardRef,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/shadcn/ui/tooltip'
import { useConfig } from '../utils/useConfig'

import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { isEqual } from 'lodash'
import type { UserAccountInfo } from '../Chat'
import { downloadChatHistory } from '../chat/downloadChatHistory'
import { Kbd } from '../components/Kbd'
import { UserMenu } from '../components/UserMenu'
import { ModelSelectField } from '../components/modelSelectField/ModelSelectField'
import { Button } from '../components/shadcn/ui/button'
import { useClientConfig } from '../utils/useClientConfig'
import styles from './TabsBar.module.css'
import { getCreateNewChatCommand } from './utils'

interface TabsBarProps {
    models?: Model[]
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
    tooltip?: React.ReactNode
    command?: string
    changesView?: boolean
    subActions?: TabSubAction[]
}

export const TabsBar = memo<TabsBarProps>(props => {
    const { currentView, setView, user, endpointHistory, models } = props
    const { isCodyProUser, IDE } = user
    const {
        config: { webviewType, multipleWebviewsEnabled, allowEndpointChange },
    } = useConfig()

    const newChatCommand = getCreateNewChatCommand({
        IDE,
        webviewType,
        multipleWebviewsEnabled,
    })

    const tabItems = useTabs({ user }, newChatCommand, currentView)

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

    // Create a ref to access the ModelSelectField methods
    const modelSelectorRef = useRef<{ open: () => void; close: () => void }>(null)

    // Set up keyboard event listener
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event.preventDefault()
            event.stopPropagation()
            // Check for meta (Command on Mac)
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'm') {
                // Open model dropdown
                modelSelectorRef?.current?.open()
            }
        }

        const handleKeyUp = (event: KeyboardEvent) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.key === 'Escape') {
                // Close model dropdown
                modelSelectorRef?.current?.close()
            }
        }

        // Add global event listener
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('keydown', handleKeyDown)

        // Clean up
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [])
    return (
        <div className={clsx(styles.tabsRoot, { [styles.tabsRootCodyWeb]: IDE === CodyIDE.Web })}>
            <Tabs.List aria-label="cody-webview" className={styles.tabsContainer}>
                <div className={styles.tabs}>
                    {currentView === View.Chat && (
                        <ModelSelectFieldToolbarItem
                            models={models}
                            userInfo={user}
                            modelSelectorRef={modelSelectorRef}
                            className="tw-mr-1"
                        />
                    )}
                    {webviewType !== 'editor' && (
                        <div className="tw-flex tw-ml-auto">
                            {tabItems.map(({ Icon, view, command, title, changesView, tooltip }) => (
                                <Tabs.Trigger key={view} value={view} asChild={true}>
                                    <TabButton
                                        Icon={Icon}
                                        view={view}
                                        title={title}
                                        IDE={IDE}
                                        isActive={currentView === view}
                                        onClick={() => handleClick(view, command, changesView)}
                                        data-testid={`tab-${view}`}
                                        tooltipExtra={tooltip}
                                        alwaysShowTitle={false}
                                    />
                                </Tabs.Trigger>
                            ))}
                            {IDE !== CodyIDE.Web && (
                                <UserMenu
                                    authStatus={user.user as AuthenticatedAuthStatus}
                                    isProUser={isCodyProUser}
                                    endpointHistory={endpointHistory}
                                    allowEndpointChange={allowEndpointChange}
                                    className="!tw-opacity-100 tw-h-full"
                                    isWorkspacesUpgradeCtaEnabled={props.isWorkspacesUpgradeCtaEnabled}
                                    IDE={IDE}
                                />
                            )}
                        </div>
                    )}
                </div>
                {webviewType !== 'editor' && (
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
                )}
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
function useTabs(
    input: Pick<TabsBarProps, 'user'>,
    newChatCommand: string,
    currentView: View
): TabConfig[] {
    const IDE = input.user.IDE

    const extensionAPI = useExtensionAPI<'userHistory'>()

    return useMemo<TabConfig[]>(
        () =>
            (
                [
                    {
                        view: View.Chat,
                        title: currentView === View.Chat ? 'New Chat' : 'Chat',
                        Icon: PlusIcon,
                        command: currentView === View.Chat ? newChatCommand : null,
                        changesView: true,
                        tooltip: (
                            <>
                                {IDE === CodyIDE.VSCode && <Kbd macOS="cmd+n" linuxAndWindows="cmd+n" />}
                            </>
                        ),
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
                                callback: () => downloadChatHistory(extensionAPI),
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
                        title: 'Prompts',
                        Icon: BookTextIcon,
                        changesView: true,
                    },
                ] as (TabConfig | null)[]
            ).filter(isDefined),
        [IDE, extensionAPI, newChatCommand, currentView]
    )
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    models?: Model[]
    userInfo: UserAccountInfo
    className?: string
    modelSelectorRef: React.RefObject<{ open: () => void; close: () => void }>
}> = ({ userInfo, className, models, modelSelectorRef }) => {
    const clientConfig = useClientConfig()
    const serverSentModelsEnabled = !!clientConfig?.modelsAPIEnabled

    const api = useExtensionAPI()

    const onModelSelect = useCallback(
        (model: Model) => {
            api.setChatModel(model.id).subscribe({
                error: error => console.error('setChatModel:', error),
            })
        },
        [api.setChatModel]
    )

    if (!models) {
        return null
    }

    return (
        !!models?.length &&
        (userInfo.isDotComUser || serverSentModelsEnabled) && (
            <ModelSelectField
                models={models}
                onModelSelect={onModelSelect}
                serverSentModelsEnabled={serverSentModelsEnabled}
                userInfo={userInfo}
                className={clsx('tw-pl-2', className)}
                data-testid="chat-model-selector"
                modelSelectorRef={modelSelectorRef}
                onCloseByEscape={() => modelSelectorRef?.current?.close()}
            />
        )
    )
}

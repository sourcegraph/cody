import {
    type AuthenticatedAuthStatus,
    CodyIDE,
    FeatureFlag,
    isDotCom,
    isWorkspaceInstance,
} from '@sourcegraph/cody-shared'
import {
    ArrowLeftRightIcon,
    BookOpenText,
    BugIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsUpDown,
    CircleHelpIcon,
    CircleXIcon,
    ExternalLinkIcon,
    LogOutIcon,
    PlusIcon,
    ServerIcon,
    Settings2Icon,
    UserCircleIcon,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { URI } from 'vscode-uri'
import { ACCOUNT_USAGE_URL, CODY_DOC_QUICKSTART_URL, isSourcegraphToken } from '../../src/chat/protocol'
import { View } from '../tabs'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { useFeatureFlag } from '../utils/useFeatureFlags'
import { UserAvatar } from './UserAvatar'
import { Badge } from './shadcn/ui/badge'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'
import { Command, CommandGroup, CommandItem, CommandLink, CommandList } from './shadcn/ui/command'
import { Form, FormControl, FormField, FormLabel, FormMessage, FormSubmit } from './shadcn/ui/form'
import { ToolbarPopoverItem } from './shadcn/ui/toolbar'
import { cn } from './shadcn/utils'

interface UserMenuProps {
    isProUser: boolean
    authStatus: AuthenticatedAuthStatus
    endpointHistory: string[]
    className?: string
    onCloseByEscape?: () => void
    allowEndpointChange: boolean
    __storybook__open?: boolean
    // Whether to show the Sourcegraph Teams upgrade CTA or not.
    isWorkspacesUpgradeCtaEnabled?: boolean
    IDE: CodyIDE
    setTabView: (tab: View) => void
}

type MenuView = 'main' | 'switch' | 'add' | 'remove' | 'debug' | 'help'

export const UserMenu: React.FunctionComponent<UserMenuProps> = ({
    isProUser,
    authStatus,
    endpointHistory,
    className,
    onCloseByEscape,
    allowEndpointChange,
    __storybook__open,
    isWorkspacesUpgradeCtaEnabled,
    IDE,
    setTabView,
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const { displayName, username, primaryEmail, endpoint } = authStatus
    const isDotComUser = isDotCom(endpoint)
    const isWorkspaceUser = isWorkspaceInstance(endpoint)
    const isMcpEnabled = useFeatureFlag(FeatureFlag.AgenticChatWithMCP)

    const userType = isDotComUser
        ? isProUser
            ? 'Pro'
            : 'Free'
        : isWorkspaceUser
          ? 'Enterprise Starter'
          : 'Enterprise'

    const [userMenuView, setUserMenuView] = useState<MenuView>('main')

    const [endpointToRemove, setEndpointToRemove] = useState<string | null>(null)

    const [addFormData, setAddFormData] = useState({
        endpoint: 'https://',
        accessToken: '',
    })

    const [validationError, setValidationError] = useState('')

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target

        if (name === 'endpoint') {
            try {
                const urlObj = new URL(value)
                if (
                    isDotCom({ endpoint: urlObj.href }) ||
                    isWorkspaceInstance({ endpoint: urlObj.href })
                ) {
                    setValidationError('This instance does not have access to Cody')
                } else {
                    setValidationError('')
                }
            } catch {
                setValidationError('')
            }
        }

        setAddFormData(prev => ({ ...prev, [name]: value }))
    }

    const onAddAndSwitchAccountSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault()
            e?.stopPropagation()

            if (validationError) {
                return
            }

            getVSCodeAPI().postMessage({
                command: 'auth',
                authKind: 'signin',
                endpoint: addFormData.endpoint,
                value: addFormData.accessToken,
            })
            onOpenChange(false)
            setUserMenuView('main')
            setEndpointToRemove(null)
            setAddFormData({ endpoint: '', accessToken: '' })
            setValidationError('')
        },
        [addFormData, validationError]
    )

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.userMenu', 'open', {})
            }
        },
        [telemetryRecorder.recordEvent]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    const onMenuViewChange = useCallback((view: MenuView): void => {
        setUserMenuView(view)
        setEndpointToRemove(null)
        setAddFormData({ endpoint: '', accessToken: '' })
        setValidationError('')
    }, [])

    const onSignOutClick = useCallback(
        (selectedEndpoint: string): void => {
            if (endpointHistory.some(e => e === selectedEndpoint)) {
                telemetryRecorder.recordEvent('cody.auth.logout', 'clicked', {
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
                getVSCodeAPI().postMessage({
                    command: 'auth',
                    authKind: 'signout',
                    endpoint: selectedEndpoint,
                })
            }
            setEndpointToRemove(null)
            setUserMenuView('main')
            setAddFormData({ endpoint: '', accessToken: '' })
            setValidationError('')
        },
        [telemetryRecorder, endpointHistory]
    )

    return (
        <ToolbarPopoverItem
            role="menu"
            iconEnd={null}
            className={cn('tw-justify-between tw-bg-inherit', className)}
            __storybook__open={__storybook__open}
            aria-label="Account Menu Button"
            popoverContent={close => (
                <Command
                    className="tw-shadow-lg tw-shadow-border-500/50 focus:tw-outline-none"
                    data-testid="user-dropdown-menu"
                >
                    {userMenuView === 'add' ? (
                        <CommandList>
                            <CommandGroup title="Add Account Menu">
                                <CommandItem className="tw-cursor-default">
                                    <span className="tw-font-semibold">Account Details</span>
                                </CommandItem>
                                <Form
                                    onSubmit={e => {
                                        onAddAndSwitchAccountSubmit(e)
                                        close()
                                    }}
                                    className="tw-flex-grow"
                                >
                                    <CommandItem className="tw-cursor-default">
                                        <FormField name="endpoint">
                                            <FormLabel title="Instance URL" />
                                            <FormControl
                                                type="url"
                                                name="endpoint"
                                                value={addFormData.endpoint}
                                                required
                                                onChange={handleInputChange}
                                            />
                                            <FormMessage match="typeMismatch">Invalid URL.</FormMessage>
                                            <FormMessage match="valueMissing">
                                                URL is required.
                                            </FormMessage>
                                            {validationError && (
                                                <div className="tw-text-red-500 tw-text-sm tw-mt-1 tw-font-medium">
                                                    {validationError}
                                                </div>
                                            )}
                                        </FormField>
                                    </CommandItem>
                                    <CommandItem className="tw-cursor-default">
                                        <Collapsible className="tw-w-full tw-justify-start">
                                            <CollapsibleTrigger asChild className="tw-text-xs">
                                                <div className="tw-flex tw-flex-grow tw-justify-between">
                                                    <span>Access Token (Optional)</span>{' '}
                                                    <ChevronsUpDown size={16} />
                                                </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <FormField name="accessToken">
                                                    <FormLabel title="Access Token" />
                                                    <FormControl
                                                        type="password"
                                                        name="accessToken"
                                                        placeholder="sgp_xxx_xxx"
                                                        value={addFormData.accessToken}
                                                        onChange={handleInputChange}
                                                        autoComplete="current-password"
                                                        required
                                                    />
                                                    <FormMessage
                                                        match={() =>
                                                            !isSourcegraphToken(addFormData.accessToken)
                                                        }
                                                    >
                                                        Invalid access token.
                                                    </FormMessage>
                                                    <FormMessage match="valueMissing">
                                                        Access token is required.
                                                    </FormMessage>
                                                </FormField>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </CommandItem>
                                    <CommandItem>
                                        <FormSubmit asChild>
                                            <Button
                                                key="add-account-confirmation-button"
                                                type="submit"
                                                className="tw-flex-grow tw-rounded-md tw-text-center"
                                                disabled={!!validationError}
                                            >
                                                Add and Switch
                                            </Button>
                                        </FormSubmit>
                                    </CommandItem>
                                </Form>
                                <CommandItem onSelect={() => onMenuViewChange('switch')}>
                                    <span className="tw-flex-grow tw-rounded-md tw-text-center">
                                        Cancel
                                    </span>
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    ) : userMenuView === 'remove' && endpointToRemove ? (
                        <CommandList>
                            <CommandGroup title="Remove Account Menu">
                                <CommandItem className="tw-cursor-default">
                                    <span className="tw-font-semibold">Remove Account?</span>
                                </CommandItem>
                                <CommandItem className="tw-cursor-default" title={endpointToRemove}>
                                    <span className="tw-font-thin">{endpointToRemove}</span>
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => {
                                        onSignOutClick(endpointToRemove)
                                        close()
                                    }}
                                >
                                    <span className="tw-flex-grow tw-rounded-md tw-text-center tw-bg-red-500 hover:tw-bg-red-600 tw-text-white">
                                        Confirm and remove
                                    </span>
                                </CommandItem>
                                <CommandItem onSelect={() => onMenuViewChange('switch')}>
                                    <span className="tw-flex-grow tw-rounded-md tw-text-center">
                                        Cancel
                                    </span>
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    ) : userMenuView === 'debug' ? (
                        <CommandList>
                            <CommandGroup title="Debug Menu">
                                <CommandItem onSelect={() => onMenuViewChange('main')}>
                                    <ChevronLeftIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Back</span>
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup>
                                <CommandItem
                                    onSelect={() => {
                                        getVSCodeAPI().postMessage({
                                            command: 'command',
                                            id: 'cody.debug.export.logs',
                                        })
                                        close()
                                    }}
                                >
                                    <span className="tw-flex-grow">Export Logs</span>
                                </CommandItem>

                                <CommandItem
                                    onSelect={() => {
                                        getVSCodeAPI().postMessage({
                                            command: 'command',
                                            id: 'cody.debug.enable.all',
                                        })
                                        close()
                                    }}
                                >
                                    <span className="tw-flex-grow">Enable Debug Mode</span>
                                </CommandItem>

                                <CommandItem
                                    onSelect={() => {
                                        getVSCodeAPI().postMessage({
                                            command: 'command',
                                            id: 'cody.debug.outputChannel',
                                        })
                                        close()
                                    }}
                                >
                                    <span className="tw-flex-grow">Open Output Channel</span>
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    ) : userMenuView === 'help' ? (
                        <CommandList>
                            <CommandGroup title="Help Menu">
                                <CommandItem onSelect={() => onMenuViewChange('main')}>
                                    <ChevronLeftIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Back</span>
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup>
                                <CommandLink
                                    href="https://community.sourcegraph.com/"
                                    target="_blank"
                                    rel="noreferrer"
                                    onSelect={() => {
                                        telemetryRecorder.recordEvent(
                                            'cody.userMenu.helpLink',
                                            'open',
                                            {}
                                        )
                                        close()
                                    }}
                                >
                                    <span className="tw-flex-grow">Sourcegraph Community</span>
                                    <ExternalLinkIcon size={16} strokeWidth={1.25} />
                                </CommandLink>

                                {IDE === CodyIDE.VSCode && (
                                    <CommandItem
                                        onSelect={() => {
                                            getVSCodeAPI().postMessage({
                                                command: 'command',
                                                id: 'cody.debug.reportIssue',
                                            })
                                            close()
                                        }}
                                    >
                                        <span className="tw-flex-grow">Report Issue</span>
                                    </CommandItem>
                                )}
                            </CommandGroup>
                        </CommandList>
                    ) : userMenuView === 'switch' ? (
                        <CommandList>
                            <CommandGroup title="Switch Account Menu">
                                <CommandItem onSelect={() => onMenuViewChange('main')}>
                                    <ChevronLeftIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Back</span>
                                </CommandItem>
                            </CommandGroup>
                            <CommandGroup>
                                {/* Display the latest endpoint first. */}
                                {[...endpointHistory].reverse().map(storedEndpoint => (
                                    <CommandItem
                                        key={`${storedEndpoint}-account`}
                                        title={`Sign Out & Remove ${storedEndpoint}`}
                                        onSelect={() => {
                                            if (storedEndpoint !== endpoint) {
                                                getVSCodeAPI().postMessage({
                                                    command: 'auth',
                                                    authKind: 'signin',
                                                    endpoint: storedEndpoint,
                                                })
                                            }
                                            close()
                                        }}
                                        className="tw-flex tw-items-center tw-justify-between"
                                    >
                                        {storedEndpoint === endpoint && (
                                            <Badge className="tw-mr-2 tw-opacity-85 tw-text-sm tw-shrink-0">
                                                Active
                                            </Badge>
                                        )}
                                        <span className="tw-flex-grow tw-truncate">
                                            {storedEndpoint}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="text"
                                            className="tw-ml-auto tw-p-0 !tw-w-fit"
                                            onClick={e => {
                                                e.stopPropagation()
                                                setEndpointToRemove(storedEndpoint)
                                                setUserMenuView('remove')
                                            }}
                                        >
                                            <CircleXIcon size={16} strokeWidth={1.25} />
                                        </Button>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                            <CommandGroup>
                                <CommandItem onSelect={() => setUserMenuView('add')}>
                                    <PlusIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Add another account</span>
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    ) : (
                        <CommandList>
                            <CommandGroup title="Main Account Menu">
                                <CommandItem>
                                    <div className="tw-flex tw-w-full tw-justify-start tw-gap-4 tw-align-middle tw-max-h-9">
                                        <UserAvatar
                                            user={authStatus}
                                            size={USER_MENU_AVATAR_SIZE}
                                            sourcegraphGradientBorder={!!isProUser}
                                            className="tw-inline-flex tw-self-center tw-items-center tw-w-auto tw-flex-none tw-max-h-9"
                                        />
                                        <div className="tw-flex tw-self-stretch tw-flex-col tw-w-full tw-items-start tw-justify-center tw-flex-auto tw-overflow-hidden">
                                            <p
                                                className="tw-text-md tw-font-semibold tw-truncate tw-w-full"
                                                title={username}
                                            >
                                                {displayName ?? username}
                                            </p>
                                            <p
                                                className="tw-text-xs tw-text-muted-foreground tw-truncate tw-w-full"
                                                title={primaryEmail}
                                            >
                                                {primaryEmail}
                                            </p>
                                        </div>
                                        <Badge
                                            variant={'secondary'}
                                            className="tw-opacity-85 tw-text-xs tw-h-fit tw-self-center tw-flex-shrink-0"
                                            title={endpoint}
                                        >
                                            {userType}
                                        </Badge>
                                    </div>
                                </CommandItem>
                            </CommandGroup>

                            <CommandGroup>
                                {isDotComUser && (
                                    <CommandItem
                                        onSelect={() => {
                                            if (username) {
                                                const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with(
                                                    {
                                                        query: `cody_client_user=${encodeURIComponent(
                                                            username
                                                        )}`,
                                                    }
                                                )
                                                getVSCodeAPI().postMessage({
                                                    command: 'links',
                                                    value: uri.toString(),
                                                })
                                            }
                                            close()
                                        }}
                                    >
                                        <UserCircleIcon
                                            size={16}
                                            strokeWidth={1.25}
                                            className="tw-mr-2"
                                        />
                                        <span className="tw-flex-grow">Manage Account</span>
                                        <ExternalLinkIcon size={16} strokeWidth={1.25} />
                                    </CommandItem>
                                )}
                                {isMcpEnabled && (
                                    <CommandItem
                                        onSelect={() => {
                                            setTabView(View.Mcp)
                                            close()
                                        }}
                                    >
                                        <ServerIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                        <span className="tw-flex-grow">MCP Settings</span>
                                    </CommandItem>
                                )}
                                <CommandItem
                                    onSelect={() => {
                                        getVSCodeAPI().postMessage({
                                            command: 'command',
                                            id: 'cody.status-bar.interacted',
                                        })
                                        close()
                                    }}
                                >
                                    <Settings2Icon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Extension Settings</span>
                                </CommandItem>
                            </CommandGroup>

                            <CommandGroup>
                                {IDE === CodyIDE.VSCode && (
                                    <CommandLink
                                        href={CODY_DOC_QUICKSTART_URL.toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        onSelect={() => {
                                            telemetryRecorder.recordEvent(
                                                'cody.userMenu.docsQuickstartLink',
                                                'open',
                                                {}
                                            )
                                            close()
                                        }}
                                    >
                                        <BookOpenText size={16} strokeWidth={1.25} className="tw-mr-2" />
                                        <span className="tw-flex-grow">Getting Started Guide</span>
                                        <ExternalLinkIcon size={16} strokeWidth={1.25} />
                                    </CommandLink>
                                )}

                                {IDE === CodyIDE.VSCode && (
                                    <CommandItem onSelect={() => onMenuViewChange('debug')}>
                                        <BugIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                        <span className="tw-flex-grow">Debug</span>
                                        <ChevronRightIcon size={16} strokeWidth={1.25} />
                                    </CommandItem>
                                )}

                                <CommandItem onSelect={() => onMenuViewChange('help')}>
                                    <CircleHelpIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Help</span>
                                    <ChevronRightIcon size={16} strokeWidth={1.25} />
                                </CommandItem>
                            </CommandGroup>

                            <CommandGroup>
                                {allowEndpointChange && (
                                    <CommandItem onSelect={() => onMenuViewChange('switch')}>
                                        <ArrowLeftRightIcon
                                            size={16}
                                            strokeWidth={1.25}
                                            className="tw-mr-2"
                                        />
                                        <span className="tw-flex-grow">Switch Account</span>
                                        <ChevronRightIcon size={16} strokeWidth={1.25} />
                                    </CommandItem>
                                )}
                                <CommandItem onSelect={() => onSignOutClick(endpoint)}>
                                    <LogOutIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                    <span className="tw-flex-grow">Sign Out</span>
                                </CommandItem>
                            </CommandGroup>
                        </CommandList>
                    )}
                </Command>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: '!tw-p-2 tw-mr-6',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    event.preventDefault()
                },
            }}
        >
            <UserAvatar
                user={authStatus}
                size={USER_MENU_AVATAR_SIZE}
                sourcegraphGradientBorder={!!isProUser}
                className="tw-max-h-full tw-width-auto"
            />
        </ToolbarPopoverItem>
    )
}

const USER_MENU_AVATAR_SIZE = 16

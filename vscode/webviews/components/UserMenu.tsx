import { type AuthenticatedAuthStatus, CodyIDE, isDotCom } from '@sourcegraph/cody-shared'
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
    Settings2Icon,
    UserCircleIcon,
    ZapIcon,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { URI } from 'vscode-uri'
import {
    ACCOUNT_USAGE_URL,
    CODY_PRO_SUBSCRIPTION_URL,
    ENTERPRISE_STARTER_LEARN_MORE_URL,
    ENTERPRISE_STARTER_PRICING_URL,
    isSourcegraphToken,
} from '../../src/chat/protocol'
import { SourcegraphLogo } from '../icons/SourcegraphLogo'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
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
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const { displayName, username, primaryEmail, endpoint } = authStatus
    const isDotComUser = isDotCom(endpoint)

    const [userMenuView, setUserMenuView] = useState<MenuView>('main')

    const [endpointToRemove, setEndpointToRemove] = useState<string | null>(null)

    const [addFormData, setAddFormData] = useState({
        endpoint: 'https://',
        accessToken: '',
    })

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setAddFormData(prev => ({ ...prev, [name]: value }))
    }, [])

    const onAddAndSwitchAccountSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault()
            e?.stopPropagation()
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
        },
        [addFormData]
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
                                {[...endpointHistory].sort((a, b) => (a === endpoint ? -1 : b === endpoint ? 1 : 0)).map(storedEndpoint => (
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
                                        <div className="tw-flex-grow tw-overflow-x-auto no-scrollbar">
                                            <span className="tw-whitespace-nowrap">
                                                {storedEndpoint}
                                            </span>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="text"
                                            className="tw-ml-auto tw-p-0 !tw-w-fit tw-shrink-0"
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

                            {isWorkspacesUpgradeCtaEnabled && (
                                <CommandGroup>
                                    <CommandLink
                                        href={ENTERPRISE_STARTER_LEARN_MORE_URL.toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="tw-flex tw-w-full tw-justify-start tw-gap-8 tw-align-center tw-flex-col tw-font-left !tw-bg-transparent hover:!tw-bg-transparent [&[aria-selected]]:!tw-bg-transparent tw-pt-[15px]"
                                    >
                                        <div className="tw-flex tw-w-full tw-justify-start tw-gap-4 tw-align-center">
                                            {/* TODO: Replace with new logo */}
                                            <SourcegraphLogo
                                                width={16}
                                                height={16}
                                                className="tw-mr-2"
                                            />
                                            <Badge
                                                variant="secondary"
                                                className="tw-opacity-85 tw-text-xs tw-h-fit tw-self-center"
                                            >
                                                Enterprise Starter
                                            </Badge>
                                        </div>
                                        <div>
                                            <div className="tw-w-full tw-text-[14px] tw-font-semibold tw-text-left tw-mb-5">
                                                Enable collaboration with your team
                                            </div>
                                            <div className="tw-text-[12px] tw-text-muted-foreground">
                                                Get your own workspace with AI-powered chat, prompt
                                                sharing and codebase search. Automate tasks and
                                                accelerate development.
                                            </div>
                                        </div>
                                        <Button
                                            key="workspace-create-button"
                                            variant="secondary"
                                            className="tw-flex-grow tw-rounded-md tw-text-center tw-w-full tw-text-foreground tw-my-2 tw-text-[12px]"
                                        >
                                            Explore Workspaces
                                        </Button>
                                    </CommandLink>
                                </CommandGroup>
                            )}
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
                                            variant={isProUser ? 'cody' : 'secondary'}
                                            className="tw-opacity-85 tw-text-xs tw-h-fit tw-self-center"
                                            title={endpoint}
                                        >
                                            {isDotComUser ? (isProUser ? 'Pro' : 'Free') : 'Enterprise'}
                                        </Badge>
                                    </div>
                                </CommandItem>
                            </CommandGroup>

                            <CommandGroup>
                                {isDotComUser && !isProUser && (
                                    <CommandLink
                                        href={CODY_PRO_SUBSCRIPTION_URL.toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        onSelect={() => {
                                            telemetryRecorder.recordEvent(
                                                'cody.userMenu.upgradeToProLink',
                                                'open',
                                                {}
                                            )
                                            close()
                                        }}
                                    >
                                        <svg className="tw-w-8 tw-h-8 tw-mr-2">
                                            <title>zapIconGradient</title>
                                            <defs>
                                                <linearGradient
                                                    id="zapIconGradient"
                                                    x1="100%"
                                                    y1="100%"
                                                    x2="0%"
                                                    y2="0%"
                                                >
                                                    <stop offset="0%" stopColor="#00cbec" />
                                                    <stop offset="50%" stopColor="#a112ff" />
                                                    <stop offset="100%" stopColor="#ff5543" />
                                                </linearGradient>
                                            </defs>
                                            <ZapIcon
                                                size={16}
                                                strokeWidth={1.25}
                                                style={{ stroke: 'url(#zapIconGradient)' }}
                                            />
                                        </svg>
                                        <span className="tw-flex-grow">Upgrade to Pro</span>
                                    </CommandLink>
                                )}
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
                                {isWorkspacesUpgradeCtaEnabled && (
                                    <CommandLink
                                        href={ENTERPRISE_STARTER_PRICING_URL.toString()}
                                        target="_blank"
                                        rel="noreferrer"
                                        onSelect={() => {
                                            telemetryRecorder.recordEvent(
                                                'cody.userMenu.exploreEnterprisePlanLink',
                                                'open',
                                                {}
                                            )
                                            close()
                                        }}
                                    >
                                        <SourcegraphLogo width={16} height={16} className="tw-mr-2" />
                                        <span className="tw-flex-grow">Explore Enterprise Plans</span>
                                        <ExternalLinkIcon size={16} strokeWidth={1.25} />
                                    </CommandLink>
                                )}
                            </CommandGroup>

                            <CommandGroup>
                                {IDE === CodyIDE.VSCode && (
                                    <CommandItem
                                        onSelect={() => {
                                            getVSCodeAPI().postMessage({
                                                command: 'command',
                                                id: 'cody.welcome',
                                            })
                                            close()
                                        }}
                                    >
                                        <BookOpenText size={16} strokeWidth={1.25} className="tw-mr-2" />
                                        <span className="tw-flex-grow">Getting Started Guide</span>
                                    </CommandItem>
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

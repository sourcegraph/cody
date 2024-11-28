import { type AuthenticatedAuthStatus, isDotCom } from '@sourcegraph/cody-shared'
import {
    ArrowLeftRightIcon,
    ChevronRightIcon,
    CircleHelpIcon,
    ExternalLinkIcon,
    Settings2Icon,
    UserCircleIcon,
} from 'lucide-react'
import { useCallback } from 'react'
import { URI } from 'vscode-uri'
import { ACCOUNT_USAGE_URL } from '../../src/chat/protocol'
import { View } from '../tabs'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useTelemetryRecorder } from '../utils/telemetry'
import { UserAvatar } from './UserAvatar'
import { Badge } from './shadcn/ui/badge'
import { Command, CommandGroup, CommandItem, CommandLink, CommandList } from './shadcn/ui/command'
import { ToolbarPopoverItem } from './shadcn/ui/toolbar'
import { cn } from './shadcn/utils'

interface UserMenuProps {
    isProUser: boolean
    authStatus: AuthenticatedAuthStatus
    endpointHistory: string[]
    setView: (view: View) => void
    className?: string
    onCloseByEscape?: () => void
    __storybook__open?: boolean
}

export const UserMenu: React.FunctionComponent<UserMenuProps> = ({
    isProUser,
    authStatus,
    endpointHistory,
    className,
    setView,
    onCloseByEscape,
    __storybook__open,
}) => {
    const telemetryRecorder = useTelemetryRecorder()
    const { displayName, username, primaryEmail, endpoint } = authStatus
    const isDotComUser = isDotCom(endpoint)
    // const switchableEndpoints = endpointHistory.filter(e => e !== endpoint)

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

    return (
        <ToolbarPopoverItem
            role="combobox"
            data-testid="user-dropdown-menu"
            iconEnd={null}
            className={cn('tw-justify-between tw-bg-inherit', className)}
            __storybook__open={__storybook__open}
            tooltip="Account"
            aria-label="Account Menu Button"
            popoverContent={close => (
                <Command className="tw-shadow-lg tw-shadow-border-500/50 focus:tw-outline-none">
                    <CommandList>
                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    setView(View.Account)
                                    close()
                                }}
                            >
                                <div className="tw-flex tw-w-full tw-justify-start tw-gap-4">
                                    <UserAvatar
                                        user={authStatus}
                                        size={16}
                                        sourcegraphGradientBorder={!!isProUser}
                                        className="tw-flex tw-justify-center"
                                    />
                                    <div className="tw-flex tw-self-stretch tw-flex-col tw-w-full tw-items-start tw-justify-center">
                                        <p className="tw-text-md tw-font-semibold">
                                            {displayName ?? username}
                                        </p>
                                        <p className="tw-text-sm tw-text-muted-foreground">
                                            {primaryEmail}
                                        </p>
                                    </div>
                                </div>
                                <Badge
                                    variant={isProUser ? 'cody' : 'secondary'}
                                    className="tw-p-0 tw-opacity-85 tw-text-sm"
                                >
                                    {isDotComUser ? (isProUser ? 'Pro' : 'Free') : 'Enterprise'}
                                </Badge>
                            </CommandItem>
                        </CommandGroup>

                        <CommandGroup>
                            {isDotComUser && (
                                <CommandItem
                                    onSelect={() => {
                                        if (username) {
                                            const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with({
                                                query: `cody_client_user=${encodeURIComponent(
                                                    username
                                                )}`,
                                            })
                                            getVSCodeAPI().postMessage({
                                                command: 'links',
                                                value: uri.toString(),
                                            })
                                        }
                                        close()
                                    }}
                                >
                                    <UserCircleIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
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
                        </CommandGroup>

                        <CommandGroup>
                            <CommandItem
                                onSelect={() => {
                                    setView(View.Account)
                                    close()
                                }}
                            >
                                <ArrowLeftRightIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                <span className="tw-flex-grow">Switch Account</span>
                                <ChevronRightIcon size={16} strokeWidth={1.25} />
                            </CommandItem>
                        </CommandGroup>

                        <CommandGroup>
                            <CommandLink
                                href="https://community.sourcegraph.com/"
                                target="_blank"
                                rel="noreferrer"
                                onSelect={() => {
                                    telemetryRecorder.recordEvent('cody.userMenu.helpLink', 'open', {})
                                    close()
                                }}
                            >
                                <CircleHelpIcon size={16} strokeWidth={1.25} className="tw-mr-2" />
                                <span className="tw-flex-grow">Help</span>
                                <ExternalLinkIcon size={16} strokeWidth={1.25} />
                            </CommandLink>
                        </CommandGroup>
                    </CommandList>
                </Command>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: 'tw-min-w-[200px] !tw-p-0',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    event.preventDefault()
                    event.stopPropagation()
                },
            }}
        >
            <UserAvatar user={authStatus} size={12} sourcegraphGradientBorder={!!isProUser} />
        </ToolbarPopoverItem>
    )
}

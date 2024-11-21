import {
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    type UserProductSubscription,
    isCodyProUser,
} from '@sourcegraph/cody-shared'
import { useCallback } from 'react'
import { URI } from 'vscode-uri'
import {
    ACCOUNT_UPGRADE_URL,
    ACCOUNT_USAGE_URL,
    type ConfigurationSubsetForWebview,
    type LocalEnv,
} from '../../src/chat/protocol'
import { AccountSwitcher } from '../components/AccountSwitcher'
import { UserAvatar } from '../components/UserAvatar'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface AccountTabProps {
    config: LocalEnv & ConfigurationSubsetForWebview
    clientCapabilities: ClientCapabilitiesWithLegacyFields
    authStatus: AuthStatus
    isDotComUser: boolean
    userProductSubscription: UserProductSubscription | null | undefined
}

// TODO: Implement the AccountTab component once the design is ready.
export const AccountTab: React.FC<AccountTabProps> = ({
    config,
    clientCapabilities,
    authStatus,
    isDotComUser,
    userProductSubscription,
}) => {
    // We open the native system pop-up for VS Code.
    if (clientCapabilities.isVSCode) {
        return null
    }

    if (!authStatus.authenticated || userProductSubscription === undefined) {
        return <div>Authenticating...</div>
    }

    const { displayName, username, primaryEmail, endpoint } = authStatus as AuthenticatedAuthStatus
    const isProUser = isCodyProUser(authStatus, userProductSubscription)
    const actions: JSX.Element[] = []

    function createButton(text: string, onClick: () => void) {
        return (
            <Button
                key={text}
                variant="secondary"
                className="tw-w-full tw-bg-popover"
                onClick={onClick}
                title={text}
            >
                {text}
            </Button>
        )
    }

    if (isDotComUser && !isProUser) {
        actions.push(
            createButton('Upgrade', () =>
                getVSCodeAPI().postMessage({ command: 'links', value: ACCOUNT_UPGRADE_URL.toString() })
            )
        )
    }

    let accountSwitcher = <div />
    if (clientCapabilities.accountSwitchingInWebview === 'enabled') {
        const endpoints: string[] = config.endpointHistory ?? []
        const switchableEndpoints = endpoints.filter(e => e !== endpoint)
        accountSwitcher = <AccountSwitcher activeEndpoint={endpoint} endpoints={switchableEndpoints} />
    }

    if (isDotComUser) {
        actions.push(
            createButton(
                'Manage Account',
                useCallback(() => {
                    if (username) {
                        const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with({
                            query: `cody_client_user=${encodeURIComponent(username)}`,
                        })
                        getVSCodeAPI().postMessage({ command: 'links', value: uri.toString() })
                    }
                }, [username])
            )
        )
    }

    actions.push(
        createButton('Settings', () =>
            getVSCodeAPI().postMessage({ command: 'command', id: 'cody.status-bar.interacted' })
        )
    )

    actions.push(
        createButton('Sign Out', () => {
            getVSCodeAPI().postMessage({ command: 'auth', authKind: 'signout' })
        })
    )

    return (
        <div className="tw-overflow-auto tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-py-6 tw-gap-6">
            <h2>Account</h2>
            <div className="tw-w-full tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                <div className="tw-flex tw-justify-between tw-w-full tw-border-b tw-border-border tw-shadow-lg tw-shadow-border-500/50 tw-p-4 tw-pb-6">
                    <div className="tw-flex tw-self-stretch tw-flex-col tw-w-full tw-items-center tw-justify-center">
                        <UserAvatar
                            user={authStatus}
                            size={30}
                            className="tw-flex-shrink-0 tw-w-[30px] tw-h-[30px] tw-flex tw-items-center tw-justify-center"
                        />
                        <div className="tw-flex tw-self-stretch tw-flex-col tw-w-full tw-items-center tw-justify-center tw-mt-4">
                            <p className="tw-text-lg tw-font-semibold">{displayName ?? username}</p>
                            <p className="tw-text-sm tw-text-muted-foreground">{primaryEmail}</p>
                        </div>
                        {accountSwitcher}
                    </div>
                </div>
                <div className="tw-grid tw-grid-cols-5 tw-gap-4">
                    <div>Plan:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">
                        {isDotComUser ? (isProUser ? 'Cody Pro' : 'Cody Free') : 'Enterprise'}
                    </div>
                    <div>Endpoint:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">
                        <a href={endpoint} target="_blank" rel="noreferrer">
                            {endpoint}
                        </a>
                    </div>
                </div>
            </div>
            <div className="tw-w-full">{actions}</div>
        </div>
    )
}

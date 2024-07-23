import { CodyIDE } from '@sourcegraph/cody-shared'
import { useCallback } from 'react'
import { URI } from 'vscode-uri'
import { ACCOUNT_USAGE_URL } from '../../src/chat/protocol'
import type { UserAccountInfo } from '../Chat'
import { MESSAGE_CELL_AVATAR_SIZE } from '../chat/cells/messageCell/BaseMessageCell'
import { UserAvatar } from '../components/UserAvatar'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'

interface AccountTabProps {
    userInfo: UserAccountInfo
}

// TODO: Implement the AccountTab component once the design is ready.
export const AccountTab: React.FC<AccountTabProps> = ({ userInfo }) => {
    const { user, isCodyProUser, isDotComUser, ide } = userInfo
    const { displayName, username, primaryEmail, endpoint } = user

    // We open the native system pop-up for VS Code.
    if (ide === CodyIDE.VSCode) {
        return null
    }

    const actions = [
        {
            text: 'Manage Account',
            onClick: useCallback(() => {
                if (userInfo.user.username) {
                    const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with({
                        query: `cody_client_user=${encodeURIComponent(userInfo.user.username)}`,
                    })
                    getVSCodeAPI().postMessage({ command: 'links', value: uri.toString() })
                }
            }, [userInfo]),
        },
        {
            text: 'Switch Account',
            onClick: () => getVSCodeAPI().postMessage({ command: 'command', id: 'cody.auth.signin' }),
        },
        {
            text: 'Sign Out',
            onClick: () => getVSCodeAPI().postMessage({ command: 'command', id: 'cody.auth.signout' }),
        },
    ]

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-py-6 tw-gap-6">
            <h2>Account</h2>
            <div className="tw-w-full tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                <div className="tw-flex tw-justify-between tw-w-full tw-border-b tw-border-border tw-shadow-lg tw-shadow-border-500/50 tw-p-4 tw-pb-6">
                    <div className="tw-flex tw-self-stretch">
                        <UserAvatar user={user} size={MESSAGE_CELL_AVATAR_SIZE} />
                        <div className="tw-ml-4">
                            <p className="tw-text-lg tw-font-semibold">{displayName ?? username}</p>
                            <p className="tw-text-sm tw-text-muted-foreground">{primaryEmail}</p>
                        </div>
                    </div>
                </div>
                <div className="tw-grid tw-grid-cols-5 tw-gap-4">
                    <div>Plan:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">
                        {isDotComUser ? (isCodyProUser ? 'Cody Pro' : 'Cody Free') : 'Enterprise'}
                    </div>
                    <div>Endpoint:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">{endpoint}</div>
                </div>
            </div>
            {actions.map(a => (
                <Button
                    key={a.text}
                    variant="secondary"
                    className="tw-w-full tw-bg-popover"
                    onClick={a.onClick}
                >
                    {a.text}
                </Button>
            ))}
        </div>
    )
}

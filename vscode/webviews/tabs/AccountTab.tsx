import { CodyIDE } from '@sourcegraph/cody-shared'
import { useCallback } from 'react'
import { URI } from 'vscode-uri'
import { ACCOUNT_USAGE_URL } from '../../src/chat/protocol'
import { MESSAGE_CELL_AVATAR_SIZE } from '../chat/cells/messageCell/BaseMessageCell'
import { UserAvatar } from '../components/UserAvatar'
import { Button } from '../components/shadcn/ui/button'
import { getVSCodeAPI } from '../utils/VSCodeApi'
import { useUserAccountInfo } from '../utils/useConfig'

// TODO: Implement the AccountTab component once the design is ready.
export const AccountTab: React.FC = () => {
    const userInfo = useUserAccountInfo()
    const { user, isCodyProUser, isDotComUser, ide } = userInfo
    const { displayName, username, primaryEmail, endpoint } = user

    // We open the native system pop-up for VS Code.
    if (ide === CodyIDE.VSCode) {
        return null
    }

    const actions: any[] = []

    actions.push({
        text: 'Switch Account...',
        onClick: useCallback(() => {
            if (userInfo.user.username) {
                getVSCodeAPI().postMessage({ command: 'command', id: 'cody.auth.switchAccount' })
            }
        }, [userInfo]),
    })
    if (isDotComUser) {
        actions.push({
            text: 'Manage Account',
            onClick: useCallback(() => {
                if (userInfo.user.username) {
                    const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with({
                        query: `cody_client_user=${encodeURIComponent(userInfo.user.username)}`,
                    })
                    getVSCodeAPI().postMessage({ command: 'links', value: uri.toString() })
                }
            }, [userInfo]),
        })
    }
    actions.push({
        text: 'Settings',
        onClick: () =>
            getVSCodeAPI().postMessage({ command: 'command', id: 'cody.status-bar.interacted' }),
    })
    actions.push({
        text: 'Sign Out',
        onClick: () => getVSCodeAPI().postMessage({ command: 'auth', authKind: 'signout' }),
    })

    return (
        <div className="tw-overflow-auto tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-px-8 tw-py-6 tw-gap-6">
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
                    className="tw-w-full tw-bg-popover tw-border tw-border-border"
                    onClick={a.onClick}
                    title={a.text}
                >
                    {a.text}
                </Button>
            ))}
        </div>
    )
}

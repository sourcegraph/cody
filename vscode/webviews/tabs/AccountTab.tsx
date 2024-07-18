import type { CodyIDE } from '@sourcegraph/cody-shared'
import {
    CircleUserRoundIcon,
    ExternalLinkIcon,
    PlusIcon,
    UserRoundCheckIcon,
    UsersRoundIcon,
} from 'lucide-react'
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
    IDE?: CodyIDE
}

export const AccountTab: React.FC<AccountTabProps> = ({ userInfo, IDE }) => {
    const onManageAccountClick = useCallback(() => {
        if (userInfo.user.username) {
            const uri = URI.parse(ACCOUNT_USAGE_URL.toString()).with({
                query: `cody_client_user=${encodeURIComponent(userInfo.user.username)}`,
            })
            getVSCodeAPI().postMessage({ command: 'links', value: uri.toString() })
        }
    }, [userInfo])

    return (
        <div className="tw-flex-1 tw-flex tw-flex-col tw-items-start tw-w-full tw-p-8 tw-gap-6">
            <div className="tw-w-full tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg">
                <div className="tw-flex tw-justify-between tw-w-full tw-border-b tw-border-border tw-shadow-lg tw-shadow-border-500/50 tw-p-4 tw-pb-6">
                    <div className="tw-flex tw-self-stretch">
                        <UserAvatar user={userInfo.user} size={MESSAGE_CELL_AVATAR_SIZE} />
                        <div>
                            <p className="tw-text-lg tw-font-semibold tw-ml-4">
                                {userInfo.user.displayName ?? userInfo.user.username}
                            </p>
                            <p className="tw-text-sm tw-text-muted-foreground tw-ml-4">
                                {userInfo.user.primaryEmail}
                            </p>
                        </div>
                    </div>
                    <Button variant="secondary" onClick={onManageAccountClick}>
                        Manage Account{' '}
                        <ExternalLinkIcon className="tw-pl-2" size={16} strokeWidth={1.25} />
                    </Button>
                </div>
                <div className="tw-grid tw-grid-cols-5 tw-gap-4">
                    <div>Plan:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">
                        {userInfo.isCodyProUser ? 'Cody Pro' : 'Cody Free'}
                    </div>
                    <div>Endpoint:</div>
                    <div className="tw-text-muted-foreground tw-col-span-4">
                        {userInfo.user.endpoint}
                    </div>
                </div>
            </div>
            <UsersRoundIcon className="tw-pr-2" size={16} strokeWidth={1.25} />
            Switch Accounts
            <div className="tw-w-full tw-px-8 tw-py-4 tw-flex tw-flex-col tw-gap-4 tw-bg-popover tw-border tw-border-border tw-rounded-lg tw-items-baseline">
                <Button variant="text" onClick={onManageAccountClick}>
                    <UserRoundCheckIcon className="tw-pr-2" size={16} strokeWidth={1.25} />{' '}
                    {userInfo.user.username} ({userInfo.user.endpoint})
                </Button>
                <Button variant="text" onClick={onManageAccountClick}>
                    <CircleUserRoundIcon className="tw-pr-2" size={16} strokeWidth={1.25} />{' '}
                    {userInfo.user.username}({userInfo.user.endpoint})
                </Button>
                <Button variant="text" onClick={onManageAccountClick}>
                    <PlusIcon className="tw-pr-2" size={16} strokeWidth={1.25} /> Sign in to new account
                </Button>
            </div>
        </div>
    )
}

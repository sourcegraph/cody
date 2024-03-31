import type { ChatMessage } from '@sourcegraph/cody-shared'
import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../../../Chat'
import { CodyLogo } from '../../../icons/CodyLogo'

export const SpeakerIcon: FunctionComponent<{
    message: Pick<ChatMessage, 'speaker'>
    userInfo: UserAccountInfo
    size: number
}> = ({ message, userInfo: { user }, size }) => {
    return message.speaker === 'human' ? (
        <UserAvatar user={user} size={size} />
    ) : (
        <CodyLogo width={size} height={size} />
    )
}
